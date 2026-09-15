-- ============================================================================
-- 0018  Promotions: quantity breaks and bundles
-- ============================================================================
-- Two shapes of offer the client asked for:
--
--   "Buy to get discount"  buy N or more of a product (or anything in a
--                          category) and that line is discounted.
--   "Bundle offer"         hold every product in a set and the set is
--                          discounted.
--
-- Both are priced inside quote_cart, like every other number in this system.
-- The client may render a saving; it may never submit one.
--
-- Ordering matters: promotions reduce the line totals FIRST, and a coupon then
-- applies to what is left. Doing it the other way round would let a percentage
-- coupon stack on an undiscounted price and pay out more than the order is
-- worth.
--
-- Idempotent.

-- ── Quantity breaks ─────────────────────────────────────────────────────────
create table if not exists public.quantity_breaks (
  id               uuid primary key default gen_random_uuid(),
  -- Exactly one of these. A product rule beats a category rule.
  product_id       uuid references public.products (id) on delete cascade,
  category_id      uuid references public.categories (id) on delete cascade,
  min_quantity     integer not null,
  discount_percent numeric(5, 2) not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),

  constraint quantity_breaks_scope check (
    (product_id is not null and category_id is null)
    or (product_id is null and category_id is not null)
  ),
  -- A "buy 1 or more" break is just a price change; use the price field.
  constraint quantity_breaks_min check (min_quantity >= 2),
  constraint quantity_breaks_percent check (
    discount_percent > 0 and discount_percent <= 90
  )
);

create unique index if not exists quantity_breaks_product_qty
  on public.quantity_breaks (product_id, min_quantity)
  where product_id is not null;

create unique index if not exists quantity_breaks_category_qty
  on public.quantity_breaks (category_id, min_quantity)
  where category_id is not null;

-- ── Bundles ─────────────────────────────────────────────────────────────────
create table if not exists public.bundles (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  description      text,
  discount_percent numeric(5, 2) not null,
  is_active        boolean not null default true,
  starts_at        timestamptz,
  ends_at          timestamptz,
  created_at       timestamptz not null default now(),

  constraint bundles_percent check (discount_percent > 0 and discount_percent <= 90),
  constraint bundles_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.bundle_items (
  bundle_id  uuid not null references public.bundles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity   integer not null default 1,
  primary key (bundle_id, product_id),
  constraint bundle_items_qty check (quantity >= 1)
);

alter table public.quantity_breaks enable row level security;
alter table public.bundles        enable row level security;
alter table public.bundle_items   enable row level security;

-- Offers are advertised, so anyone may read the active ones. Only staff write.
drop policy if exists quantity_breaks_read on public.quantity_breaks;
create policy quantity_breaks_read on public.quantity_breaks
  for select using (is_active or public.is_staff());

drop policy if exists quantity_breaks_write on public.quantity_breaks;
create policy quantity_breaks_write on public.quantity_breaks
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists bundles_read on public.bundles;
create policy bundles_read on public.bundles
  for select using (is_active or public.is_staff());

drop policy if exists bundles_write on public.bundles;
create policy bundles_write on public.bundles
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists bundle_items_read on public.bundle_items;
create policy bundle_items_read on public.bundle_items
  for select using (true);

drop policy if exists bundle_items_write on public.bundle_items;
create policy bundle_items_write on public.bundle_items
  for all using (public.is_staff()) with check (public.is_staff());

-- Re-created to price the promotions above.
create or replace function public.quote_cart(
  p_cart_id uuid,
  p_district text default null,
  p_coupon_code text default null,
  p_payment_method public.payment_method default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cart public.carts;
  v_lines jsonb := '[]'::jsonb;
  v_line record;
  v_subtotal integer := 0;
  v_eligible_subtotal integer := 0;
  v_item_count integer := 0;
  v_coupon public.coupons;
  v_coupon_code text;
  v_discount integer := 0;
  v_coupon_error text;
  v_zone public.delivery_zones;
  v_delivery_fee integer := 0;
  v_method_adjust integer := 0;
  v_promo_total integer := 0;
  v_promos jsonb := '[]'::jsonb;
  v_break_pct numeric;
  v_bundle record;
  v_bundle_need integer;
  v_bundle_have integer;
  v_bundle_base integer;
  v_bundle_cut integer;
  v_adjust_map jsonb;
  v_blocking_issues integer := 0;
  v_user uuid := (select auth.uid());
  v_user_uses integer := 0;
begin
  select * into v_cart from public.carts where id = p_cart_id;
  if v_cart.id is null then
    return jsonb_build_object(
      'cart_id', null, 'lines', '[]'::jsonb, 'item_count', 0,
      'subtotal_paisa', 0, 'discount_paisa', 0, 'delivery_fee_paisa', 0,
      'total_paisa', 0, 'coupon', null, 'coupon_error', null,
      'delivery_zone', null, 'has_blocking_issue', false
    );
  end if;

  -- Ownership check. This function is SECURITY DEFINER, so it must do the
  -- authorization that RLS would otherwise have done for it.
  if v_cart.user_id is not null and v_cart.user_id <> coalesce(v_user, '00000000-0000-0000-0000-000000000000'::uuid) then
    raise exception 'cart_forbidden' using errcode = '42501';
  end if;

  for v_line in
    select
      ci.id            as cart_item_id,
      ci.product_id,
      ci.variant_id,
      ci.quantity,
      p.name           as product_name,
      p.slug           as product_slug,
      p.sku            as product_sku,
      p.thumbnail_url,
      p.status         as product_status,
      p.stock          as product_stock,
      p.category_id,
      v.name           as variant_name,
      v.sku            as variant_sku,
      v.stock          as variant_stock,
      v.is_active      as variant_active,
      v.image_url      as variant_image,
      ep.unit_price_paisa,
      ep.compare_at_paisa,
      ep.flash_sale_item_id
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    left join public.product_variants v on v.id = ci.variant_id
    cross join lateral public.effective_price(ci.product_id, ci.variant_id) ep
    where ci.cart_id = p_cart_id
    order by ci.created_at
  loop
    declare
      v_available integer := coalesce(v_line.variant_stock, v_line.product_stock, 0);
      v_issue text := null;
      v_qty integer := v_line.quantity;
      v_line_total integer;
      v_line_promo integer := 0;
    begin
      if v_line.product_status <> 'active'
         or (v_line.variant_id is not null and coalesce(v_line.variant_active, false) = false) then
        v_issue := 'unavailable';
      elsif v_available <= 0 then
        v_issue := 'out_of_stock';
      elsif v_available < v_qty then
        v_issue := 'insufficient_stock';
      end if;

      if v_issue is not null then
        v_blocking_issues := v_blocking_issues + 1;
      end if;

      -- Unavailable lines contribute nothing; short lines contribute what is
      -- actually available so the displayed total is never a fantasy.
      if v_issue in ('unavailable', 'out_of_stock') then
        v_line_total := 0;
      elsif v_issue = 'insufficient_stock' then
        v_line_total := v_line.unit_price_paisa * v_available;
      else
        v_line_total := v_line.unit_price_paisa * v_qty;
      end if;

      -- ── Quantity break ────────────────────────────────────────────────
      -- Best rule wins, and a rule naming the product beats one naming its
      -- category. Only sellable lines qualify: discounting something we
      -- cannot ship would advertise a saving the customer never receives.
      if v_issue is null then
        select qb.discount_percent
          into v_break_pct
          from public.quantity_breaks qb
         where qb.is_active
           and qb.min_quantity <= v_qty
           and (
             qb.product_id = v_line.product_id
             or (qb.product_id is null and qb.category_id = v_line.category_id)
           )
         order by (qb.product_id is not null) desc, qb.min_quantity desc
         limit 1;

        if v_break_pct is not null then
          v_line_promo := floor(v_line_total * v_break_pct / 100.0)::integer;
          v_line_total := v_line_total - v_line_promo;
          v_promo_total := v_promo_total + v_line_promo;

          v_promos := v_promos || jsonb_build_object(
            'kind', 'quantity',
            'label', format('Buy %s+ · %s%% off', (
              select min(q.min_quantity) from public.quantity_breaks q
               where q.is_active and q.discount_percent = v_break_pct
                 and (q.product_id = v_line.product_id
                      or (q.product_id is null and q.category_id = v_line.category_id))
            ), trim(trailing '.' from trim(to_char(v_break_pct, 'FM999990.99')))),
            'product_name', v_line.product_name,
            'amount_paisa', v_line_promo
          );
        end if;
        v_break_pct := null;
      end if;

      v_subtotal := v_subtotal + v_line_total;
      v_item_count := v_item_count + case when v_issue in ('unavailable', 'out_of_stock') then 0 else least(v_qty, v_available) end;

      v_lines := v_lines || jsonb_build_object(
        'cart_item_id', v_line.cart_item_id,
        'product_id', v_line.product_id,
        'variant_id', v_line.variant_id,
        'product_name', v_line.product_name,
        'product_slug', v_line.product_slug,
        'variant_name', v_line.variant_name,
        'sku', coalesce(v_line.variant_sku, v_line.product_sku),
        'image_url', coalesce(v_line.variant_image, v_line.thumbnail_url),
        'category_id', v_line.category_id,
        'quantity', v_qty,
        'available_stock', v_available,
        'unit_price_paisa', v_line.unit_price_paisa,
        'compare_at_paisa', v_line.compare_at_paisa,
        'line_total_paisa', v_line_total,
        'promo_discount_paisa', v_line_promo,
        'is_flash_sale', v_line.flash_sale_item_id is not null,
        'issue', v_issue
      );
    end;
  end loop;

  -- ── Coupon ────────────────────────────────────────────────────────────────
  v_coupon_code := upper(trim(coalesce(nullif(p_coupon_code, ''), v_cart.coupon_code, '')));

  if v_coupon_code <> '' then
    select * into v_coupon from public.coupons where upper(code) = v_coupon_code;

    if v_coupon.id is null then
      v_coupon_error := 'not_found';
    elsif not v_coupon.is_active then
      v_coupon_error := 'inactive';
    elsif v_coupon.starts_at is not null and now() < v_coupon.starts_at then
      v_coupon_error := 'not_started';
    elsif v_coupon.expires_at is not null and now() > v_coupon.expires_at then
      v_coupon_error := 'expired';
    elsif v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      v_coupon_error := 'exhausted';
    else
      if v_user is not null then
        select count(*) into v_user_uses
        from public.coupon_usage cu
        where cu.coupon_id = v_coupon.id and cu.user_id = v_user;
        if v_user_uses >= v_coupon.per_user_limit then
          v_coupon_error := 'already_used';
        end if;
      end if;

      if v_coupon_error is null then
        -- Scope the discount to eligible lines only.
        select coalesce(sum((l ->> 'line_total_paisa')::integer), 0)
          into v_eligible_subtotal
        from jsonb_array_elements(v_lines) l
        where (l ->> 'issue') is null
          and (
            cardinality(v_coupon.product_ids) = 0
            or (l ->> 'product_id')::uuid = any (v_coupon.product_ids)
          )
          and (
            cardinality(v_coupon.category_ids) = 0
            or (l ->> 'category_id')::uuid = any (v_coupon.category_ids)
          );

        if v_eligible_subtotal = 0 then
          v_coupon_error := 'not_applicable';
        elsif v_subtotal < v_coupon.min_order_paisa then
          v_coupon_error := 'min_order';
        else
          if v_coupon.discount_type = 'percentage' then
            v_discount := floor(v_eligible_subtotal * v_coupon.discount_value / 100.0)::integer;
          else
            v_discount := v_coupon.discount_value;
          end if;

          if v_coupon.max_discount_paisa is not null then
            v_discount := least(v_discount, v_coupon.max_discount_paisa);
          end if;
          -- Never discount more than the eligible lines are worth.
          v_discount := least(v_discount, v_eligible_subtotal);
        end if;
      end if;
    end if;

    if v_coupon_error is not null then
      v_discount := 0;
    end if;
  end if;

  -- ── Bundles ───────────────────────────────────────────────────────────────
  -- A bundle applies only when EVERY product in it is in the cart at the
  -- required quantity and sellable. The cut is taken off the bundle's own
  -- lines, not the whole cart, so adding an unrelated item never inflates it.
  for v_bundle in
    select b.* from public.bundles b
     where b.is_active
       and (b.starts_at is null or b.starts_at <= now())
       and (b.ends_at is null or b.ends_at >= now())
  loop
    select count(*) into v_bundle_need
      from public.bundle_items bi where bi.bundle_id = v_bundle.id;

    select count(*) into v_bundle_have
      from public.bundle_items bi
     where bi.bundle_id = v_bundle.id
       and exists (
         select 1 from jsonb_array_elements(v_lines) l
          where (l ->> 'product_id')::uuid = bi.product_id
            and (l ->> 'quantity')::integer >= bi.quantity
            and l ->> 'issue' is null
       );

    if v_bundle_need > 0 and v_bundle_have = v_bundle_need then
      select coalesce(sum((l ->> 'line_total_paisa')::integer), 0)
        into v_bundle_base
        from jsonb_array_elements(v_lines) l
       where (l ->> 'product_id')::uuid in (
         select bi.product_id from public.bundle_items bi where bi.bundle_id = v_bundle.id
       );

      v_bundle_cut := floor(v_bundle_base * v_bundle.discount_percent / 100.0)::integer;

      if v_bundle_cut > 0 then
        v_subtotal := v_subtotal - v_bundle_cut;
        v_promo_total := v_promo_total + v_bundle_cut;
        v_promos := v_promos || jsonb_build_object(
          'kind', 'bundle',
          'label', v_bundle.name,
          'product_name', null,
          'amount_paisa', v_bundle_cut
        );
      end if;
    end if;
  end loop;

  -- ── Delivery ──────────────────────────────────────────────────────────────
  if p_district is not null and trim(p_district) <> '' then
    select * into v_zone from public.resolve_delivery_zone(p_district);
    if v_zone.id is not null then
      v_delivery_fee := v_zone.fee_paisa;
      if v_zone.free_above_paisa is not null
         and (v_subtotal - v_discount) >= v_zone.free_above_paisa then
        v_delivery_fee := 0;
      end if;
    end if;
  end if;

  -- ── Delivery adjustment by payment method ────────────────────────────────
  -- Prepaid orders cost us less to collect than cash on delivery, so the
  -- operator can pass some of that back. The map lives in settings, is read
  -- here rather than sent by the client, and the result is floored at zero so
  -- a generous discount can never make delivery negative and pay the customer.
  if p_payment_method is not null then
    select value into v_adjust_map
    from public.settings
    where key = 'delivery_payment_adjust';

    v_method_adjust := coalesce(
      (v_adjust_map ->> p_payment_method::text)::integer, 0
    );
    v_delivery_fee := greatest(0, v_delivery_fee + v_method_adjust);
  end if;

  -- An empty cart never carries a delivery fee.
  if v_subtotal = 0 then
    v_delivery_fee := 0;
    v_discount := 0;
  end if;

  return jsonb_build_object(
    'cart_id', p_cart_id,
    'lines', v_lines,
    'item_count', v_item_count,
    'subtotal_paisa', v_subtotal,
    'discount_paisa', v_discount,
    'promo_discount_paisa', v_promo_total,
    'promotions', v_promos,
    'delivery_fee_paisa', v_delivery_fee,
    'delivery_adjust_paisa', v_method_adjust,
    'total_paisa', v_subtotal - v_discount + v_delivery_fee,
    'coupon', case
      when v_coupon.id is not null and v_coupon_error is null then jsonb_build_object(
        'id', v_coupon.id,
        'code', v_coupon.code,
        'description', v_coupon.description,
        'discount_type', v_coupon.discount_type,
        'discount_value', v_coupon.discount_value
      ) else null end,
    'coupon_code_attempted', nullif(v_coupon_code, ''),
    'coupon_error', v_coupon_error,
    'delivery_zone', case when v_zone.id is not null then jsonb_build_object(
        'id', v_zone.id,
        'name', v_zone.name,
        'slug', v_zone.slug,
        'fee_paisa', v_zone.fee_paisa,
        'free_above_paisa', v_zone.free_above_paisa,
        'min_days', v_zone.min_days,
        'max_days', v_zone.max_days
      ) else null end,
    'has_blocking_issue', v_blocking_issues > 0
  );
end;
$$;

grant execute on function public.quote_cart(uuid, text, text, public.payment_method) to anon, authenticated;

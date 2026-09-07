-- ============================================================================
-- 0008  Pricing engine — the only place a money figure is decided
-- ============================================================================
-- The browser never sends a price, a discount or a total. It sends a cart id,
-- a district and (optionally) a coupon code. Everything else is derived here
-- from live catalog rows. `place_order` re-runs the same quote it just showed
-- the customer, so a stale or forged client payload cannot change what is
-- charged.

-- ── Effective unit price for one line ───────────────────────────────────────
-- Precedence: live flash-sale price → variant price → product price.
-- compare_at is whatever "was" price we can legitimately strike through.
create or replace function public.effective_price(
  p_product_id uuid,
  p_variant_id uuid default null
)
returns table (
  unit_price_paisa integer,
  compare_at_paisa integer,
  flash_sale_item_id uuid
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  base_price integer;
  base_compare integer;
  v_price integer;
  v_compare integer;
  fs_price integer;
  fs_item uuid;
begin
  select p.price_paisa, p.compare_at_paisa into base_price, base_compare
  from public.products p where p.id = p_product_id;

  if base_price is null then
    return;
  end if;

  if p_variant_id is not null then
    select v.price_paisa, v.compare_at_paisa into v_price, v_compare
    from public.product_variants v
    where v.id = p_variant_id and v.product_id = p_product_id;
    base_price := coalesce(v_price, base_price);
    base_compare := coalesce(v_compare, base_compare);
  end if;

  select fsi.sale_price_paisa, fsi.id into fs_price, fs_item
  from public.flash_sale_items fsi
  join public.flash_sales fs on fs.id = fsi.flash_sale_id
  where fsi.product_id = p_product_id
    and fs.is_active
    and now() between fs.starts_at and fs.ends_at
    and (fsi.stock_limit is null or fsi.sold_count < fsi.stock_limit)
  order by fsi.sale_price_paisa asc
  limit 1;

  if fs_price is not null and fs_price < base_price then
    unit_price_paisa := fs_price;
    compare_at_paisa := greatest(base_price, coalesce(base_compare, 0));
    flash_sale_item_id := fs_item;
  else
    unit_price_paisa := base_price;
    compare_at_paisa := base_compare;
    flash_sale_item_id := null;
  end if;

  return next;
end;
$$;

-- ── Delivery zone resolution ────────────────────────────────────────────────
create or replace function public.resolve_delivery_zone(p_district text)
returns public.delivery_zones
language sql
stable
set search_path = public, pg_temp
as $$
  select z.* from public.delivery_zones z
  where z.is_active
    and (
      -- Exact district match wins…
      lower(trim(coalesce(p_district, ''))) = any (
        select lower(trim(d)) from unnest(z.districts) d
      )
      -- …otherwise the fallback zone.
      or z.is_fallback
    )
  order by z.is_fallback asc, z.position asc
  limit 1;
$$;

-- ── Cart quote ──────────────────────────────────────────────────────────────
-- Returns a complete, authoritative price breakdown as JSON. Line rows carry
-- `issue` when something blocks checkout ('out_of_stock' | 'insufficient_stock'
-- | 'unavailable') so the UI can explain itself instead of failing silently.
create or replace function public.quote_cart(
  p_cart_id uuid,
  p_district text default null,
  p_coupon_code text default null
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
    'delivery_fee_paisa', v_delivery_fee,
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

grant execute on function public.quote_cart(uuid, text, text) to anon, authenticated;
grant execute on function public.resolve_delivery_zone(text) to anon, authenticated;
grant execute on function public.effective_price(uuid, uuid) to anon, authenticated;

-- ============================================================================
-- 0016  Delivery fee varies by payment method
-- ============================================================================
-- Cash on delivery costs the shop money to collect; prepaid does not. This
-- lets the operator price that difference and show it in the cart, so the
-- customer can see what choosing bKash saves them BEFORE they commit.
--
-- The amounts live in `settings`, not in code, and are applied inside
-- quote_cart -- the client may display a figure but never submits one. The
-- same function backs both the cart quote and place_order, so what is quoted
-- is what is charged.
--
-- Idempotent: re-running is safe.

insert into public.settings (key, value, description, is_public) values
  ('delivery_payment_adjust',
   '{"cod": 0, "bkash": -2000, "nagad": -2000, "card": -2000, "other": 0}'::jsonb,
   'Delivery fee adjustment in paisa, per payment method. Negative is a discount. The result is floored at zero.',
   true)
on conflict (key) do nothing;

-- The 3-argument form has to go rather than be left alongside: adding a
-- defaulted 4th parameter to a NEW function would make a 3-argument call
-- ambiguous, and Postgres raises "function is not unique" at runtime.
drop function if exists public.quote_cart(uuid, text, text);

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

-- Re-created only to pass the payment method through to quote_cart.
create or replace function public.place_order(
  p_cart_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_district text,
  p_area text,
  p_street text,
  p_postcode text,
  p_landmark text,
  p_payment_method public.payment_method,
  p_customer_note text default null,
  p_address_id uuid default null,
  p_guest_token text default null,
  p_save_address boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_cart public.carts;
  v_quote jsonb;
  v_line jsonb;
  v_zone public.delivery_zones;
  v_order public.orders;
  v_coupon_id uuid;
  v_coupon_code text;
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_payment_status public.payment_status;
begin
  v_cart := public.assert_cart_access(p_cart_id, p_guest_token);

  -- Normalise the phone the same way the table triggers would, so validation
  -- failures surface here as a clean error rather than a constraint violation.
  if length(v_phone) = 13 and left(v_phone, 3) = '880' then
    v_phone := substr(v_phone, 4);
  elsif length(v_phone) = 12 and left(v_phone, 2) = '88' then
    v_phone := substr(v_phone, 3);
  elsif length(v_phone) = 10 and left(v_phone, 1) = '1' then
    v_phone := '0' || v_phone;
  end if;

  if v_phone !~ '^01[3-9][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  -- Lock every product (and variant) in the cart before reading stock, so two
  -- concurrent checkouts cannot both pass the availability check.
  perform 1
  from public.products p
  where p.id in (select product_id from public.cart_items where cart_id = p_cart_id)
  order by p.id
  for update;

  perform 1
  from public.product_variants v
  where v.id in (
    select variant_id from public.cart_items
    where cart_id = p_cart_id and variant_id is not null
  )
  order by v.id
  for update;

  -- p_payment_method is passed through so the fee the customer was
  -- quoted is the fee they are charged. Without it an order placed
  -- with bKash would be written with the cash-on-delivery fee.
  v_quote := public.quote_cart(
    p_cart_id, p_district, v_cart.coupon_code, p_payment_method
  );

  if coalesce((v_quote ->> 'item_count')::integer, 0) = 0 then
    raise exception 'cart_empty' using errcode = 'P0001';
  end if;
  if (v_quote ->> 'has_blocking_issue')::boolean then
    raise exception 'stock_changed' using errcode = 'P0001';
  end if;

  select * into v_zone from public.resolve_delivery_zone(p_district);
  if v_zone.id is null then
    raise exception 'delivery_unavailable' using errcode = 'P0001';
  end if;

  v_coupon_id := nullif(v_quote -> 'coupon' ->> 'id', '')::uuid;
  v_coupon_code := v_quote -> 'coupon' ->> 'code';

  -- COD is unpaid-on-purpose; online methods start out pending and are only
  -- moved to successful by a verified gateway callback.
  v_payment_status := 'pending';

  insert into public.orders (
    user_id,
    customer_name, customer_phone, customer_email,
    shipping_district, shipping_area, shipping_street, shipping_postcode, shipping_landmark,
    address_id,
    delivery_zone_id, delivery_zone_name, delivery_min_days, delivery_max_days,
    subtotal_paisa, discount_paisa, delivery_fee_paisa, total_paisa,
    coupon_id, coupon_code,
    payment_method, payment_status,
    customer_note
  ) values (
    v_user,
    trim(p_customer_name), v_phone, nullif(trim(coalesce(p_customer_email, '')), ''),
    trim(p_district), trim(p_area), trim(p_street),
    nullif(trim(coalesce(p_postcode, '')), ''), nullif(trim(coalesce(p_landmark, '')), ''),
    p_address_id,
    v_zone.id, v_zone.name, v_zone.min_days, v_zone.max_days,
    (v_quote ->> 'subtotal_paisa')::integer,
    (v_quote ->> 'discount_paisa')::integer,
    (v_quote ->> 'delivery_fee_paisa')::integer,
    (v_quote ->> 'total_paisa')::integer,
    v_coupon_id, v_coupon_code,
    p_payment_method, v_payment_status,
    nullif(trim(coalesce(p_customer_note, '')), '')
  )
  returning * into v_order;

  -- Lines, with a snapshot of everything the invoice needs.
  for v_line in select * from jsonb_array_elements(v_quote -> 'lines')
  loop
    insert into public.order_items (
      order_id, product_id, variant_id,
      product_name, variant_name, sku, image_url,
      unit_price_paisa, quantity, line_total_paisa
    ) values (
      v_order.id,
      (v_line ->> 'product_id')::uuid,
      nullif(v_line ->> 'variant_id', '')::uuid,
      v_line ->> 'product_name',
      nullif(v_line ->> 'variant_name', ''),
      v_line ->> 'sku',
      nullif(v_line ->> 'image_url', ''),
      (v_line ->> 'unit_price_paisa')::integer,
      (v_line ->> 'quantity')::integer,
      (v_line ->> 'line_total_paisa')::integer
    );

    -- Decrement stock. Variant stock cascades up to products.stock via trigger.
    if nullif(v_line ->> 'variant_id', '') is not null then
      update public.product_variants
         set stock = greatest(0, stock - (v_line ->> 'quantity')::integer)
       where id = (v_line ->> 'variant_id')::uuid;
    else
      update public.products
         set stock = greatest(0, stock - (v_line ->> 'quantity')::integer)
       where id = (v_line ->> 'product_id')::uuid;
    end if;

    update public.products
       set units_sold = units_sold + (v_line ->> 'quantity')::integer
     where id = (v_line ->> 'product_id')::uuid;

    if (v_line ->> 'is_flash_sale')::boolean then
      update public.flash_sale_items fsi
         set sold_count = fsi.sold_count + (v_line ->> 'quantity')::integer
        from public.flash_sales fs
       where fs.id = fsi.flash_sale_id
         and fsi.product_id = (v_line ->> 'product_id')::uuid
         and fs.is_active
         and now() between fs.starts_at and fs.ends_at;
    end if;
  end loop;

  -- Coupon accounting.
  if v_coupon_id is not null then
    insert into public.coupon_usage (coupon_id, user_id, order_id, discount_paisa)
    values (v_coupon_id, v_user, v_order.id, (v_quote ->> 'discount_paisa')::integer);

    update public.coupons set used_count = used_count + 1 where id = v_coupon_id;
  end if;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (v_order.id, 'placed', 'Order received', v_user);

  insert into public.payments (order_id, provider, status, amount_paisa)
  values (
    v_order.id,
    p_payment_method,
    case when p_payment_method = 'cod' then 'pending'::public.payment_status
         else 'initiated'::public.payment_status end,
    v_order.total_paisa
  );

  -- Optionally remember the address for next time.
  if p_save_address and v_user is not null then
    insert into public.addresses (
      user_id, label, recipient_name, phone, district, area, street, postcode, landmark, is_default
    )
    select
      v_user, 'Home', trim(p_customer_name), v_phone, trim(p_district), trim(p_area),
      trim(p_street), nullif(trim(coalesce(p_postcode, '')), ''),
      nullif(trim(coalesce(p_landmark, '')), ''),
      not exists (select 1 from public.addresses where user_id = v_user)
    where not exists (
      select 1 from public.addresses a
      where a.user_id = v_user
        and a.street = trim(p_street)
        and a.area = trim(p_area)
        and a.district = trim(p_district)
    );
  end if;

  delete from public.cart_items where cart_id = p_cart_id;
  update public.carts set coupon_code = null where id = p_cart_id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'total_paisa', v_order.total_paisa,
    'payment_method', v_order.payment_method,
    'payment_status', v_order.payment_status,
    'status', v_order.status
  );
end;
$$;

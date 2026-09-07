-- ============================================================================
-- 0014  Fix: +880 numbers normalised to an invalid local form
-- ============================================================================
-- The original normalisation in 0002 (and the copies inside place_order and
-- track_order) used an if/elsif chain:
--
--     if    length = 13 and left 3 = '880' then strip 3
--     elsif length = 12 and left 2 = '88'  then strip 2
--     elsif length = 10 and left 1 = '1'   then prepend '0'
--
-- The branches are mutually exclusive, so stripping a country code could never
-- also restore the leading zero. '+8801712345678' became '1712345678' — ten
-- digits, no leading zero — which then failed
-- `phone ~ '^01[3-9][0-9]{8}$'` and raised a constraint violation on what is a
-- perfectly ordinary way to write a Bangladeshi mobile number.
--
-- The fix is to make the steps SEQUENTIAL: strip the country code, then restore
-- the local zero.

create or replace function public.tg_normalise_phone()
returns trigger
language plpgsql
as $$
declare
  digits text;
begin
  if new.phone is null then
    return new;
  end if;

  digits := regexp_replace(new.phone, '[^0-9]', '', 'g');

  -- Step 1: drop the country code, however it was written.
  if length(digits) = 13 and left(digits, 3) = '880' then
    digits := substr(digits, 4);
  elsif length(digits) = 12 and left(digits, 2) = '88' then
    digits := substr(digits, 3);
  end if;

  -- Step 2: restore the local leading zero. Runs whether or not step 1 fired.
  if length(digits) = 10 and left(digits, 1) = '1' then
    digits := '0' || digits;
  end if;

  new.phone := digits;
  return new;
end;
$$;

-- Shared helper so the three call sites stop keeping their own copies.
create or replace function public.normalise_bd_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if length(digits) = 13 and left(digits, 3) = '880' then
    digits := substr(digits, 4);
  elsif length(digits) = 12 and left(digits, 2) = '88' then
    digits := substr(digits, 3);
  end if;

  if length(digits) = 10 and left(digits, 1) = '1' then
    digits := '0' || digits;
  end if;

  return digits;
end;
$$;

grant execute on function public.normalise_bd_phone(text) to anon, authenticated;

-- ── place_order: use the shared helper ──────────────────────────────────────
-- Only the phone-normalisation block changes; everything else is identical to
-- the definition in 0010.
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
  v_phone text := public.normalise_bd_phone(p_customer_phone);
  v_payment_status public.payment_status;
begin
  v_cart := public.assert_cart_access(p_cart_id, p_guest_token);

  if v_phone !~ '^01[3-9][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

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

  v_quote := public.quote_cart(p_cart_id, p_district, v_cart.coupon_code);

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

grant execute on function public.place_order(
  uuid, text, text, text, text, text, text, text, text,
  public.payment_method, text, uuid, text, boolean
) to anon, authenticated;

-- ── track_order: same helper, so a customer can paste +880… ─────────────────
create or replace function public.track_order(p_order_number text, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_phone text := public.normalise_bd_phone(p_phone);
begin
  select * into v_order from public.orders
  where upper(order_number) = upper(trim(coalesce(p_order_number, '')))
    and customer_phone = v_phone;

  if v_order.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'status', v_order.status,
    'payment_method', v_order.payment_method,
    'payment_status', v_order.payment_status,
    'placed_at', v_order.placed_at,
    'customer_name', v_order.customer_name,
    'delivery_zone_name', v_order.delivery_zone_name,
    'delivery_min_days', v_order.delivery_min_days,
    'delivery_max_days', v_order.delivery_max_days,
    'shipping_area', v_order.shipping_area,
    'shipping_district', v_order.shipping_district,
    'subtotal_paisa', v_order.subtotal_paisa,
    'discount_paisa', v_order.discount_paisa,
    'delivery_fee_paisa', v_order.delivery_fee_paisa,
    'total_paisa', v_order.total_paisa,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name,
        'variant_name', oi.variant_name,
        'image_url', oi.image_url,
        'quantity', oi.quantity,
        'unit_price_paisa', oi.unit_price_paisa,
        'line_total_paisa', oi.line_total_paisa
      ) order by oi.product_name), '[]'::jsonb)
      from public.order_items oi where oi.order_id = v_order.id
    ),
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'status', h.status, 'note', h.note, 'created_at', h.created_at
      ) order by h.created_at), '[]'::jsonb)
      from public.order_status_history h where h.order_id = v_order.id
    )
  );
end;
$$;

grant execute on function public.track_order(text, text) to anon, authenticated;

-- Repair any rows already stored in the broken 10-digit form.
update public.profiles
   set phone = '0' || phone
 where phone is not null
   and phone ~ '^1[3-9][0-9]{8}$';

update public.addresses
   set phone = '0' || phone
 where phone ~ '^1[3-9][0-9]{8}$';

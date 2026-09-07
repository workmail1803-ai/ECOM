-- ============================================================================
-- 0010  Order placement, status transitions, tracking, payment settlement
-- ============================================================================

-- ── place_order ─────────────────────────────────────────────────────────────
-- The single entry point for creating an order. It re-quotes the cart from live
-- catalog data, locks the stock rows it is about to decrement, and writes the
-- order, its lines, the initial status history row and the payment record in
-- one transaction. Nothing about money comes from the caller.
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

grant execute on function public.place_order(
  uuid, text, text, text, text, text, text, text, text,
  public.payment_method, text, uuid, text, boolean
) to anon, authenticated;

-- ── Status transitions (staff only) ─────────────────────────────────────────
-- Legal transitions are declared once, here, instead of being re-implemented in
-- every admin button handler.
create or replace function public.order_status_allowed(
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'placed'           then p_to in ('confirmed', 'cancelled')
    when 'confirmed'        then p_to in ('processing', 'cancelled')
    when 'processing'       then p_to in ('shipped', 'cancelled')
    when 'shipped'          then p_to in ('out_for_delivery', 'cancelled', 'returned')
    when 'out_for_delivery' then p_to in ('delivered', 'cancelled', 'returned')
    when 'delivered'        then p_to in ('returned')
    else false
  end;
$$;

create or replace function public.update_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_actor uuid := (select auth.uid());
  v_item record;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status = p_status then
    return jsonb_build_object('status', v_order.status, 'changed', false);
  end if;

  if not public.order_status_allowed(v_order.status, p_status) then
    raise exception 'illegal_transition' using errcode = 'P0001',
      detail = format('%s -> %s', v_order.status, p_status);
  end if;

  -- Cancelling or returning puts the units back on the shelf exactly once.
  if p_status in ('cancelled', 'returned')
     and v_order.status not in ('cancelled', 'returned') then
    for v_item in
      select product_id, variant_id, quantity from public.order_items where order_id = p_order_id
    loop
      if v_item.variant_id is not null then
        update public.product_variants set stock = stock + v_item.quantity
        where id = v_item.variant_id;
      elsif v_item.product_id is not null then
        update public.products set stock = stock + v_item.quantity
        where id = v_item.product_id;
      end if;
      if v_item.product_id is not null then
        update public.products
           set units_sold = greatest(0, units_sold - v_item.quantity)
         where id = v_item.product_id;
      end if;
    end loop;
  end if;

  update public.orders
     set status = p_status,
         confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
         shipped_at   = case when p_status = 'shipped' then now() else shipped_at end,
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
         cancel_reason = case when p_status = 'cancelled' then coalesce(p_note, cancel_reason) else cancel_reason end,
         -- Cash collected on delivery settles the payment.
         payment_status = case
           when p_status = 'delivered' and payment_method = 'cod' then 'successful'::public.payment_status
           when p_status = 'cancelled' and payment_status = 'pending' then 'cancelled'::public.payment_status
           else payment_status
         end
   where id = p_order_id;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_status, p_note, v_actor);

  perform public.log_audit(
    'order.status_change', 'order', p_order_id::text,
    jsonb_build_object('status', jsonb_build_object('from', v_order.status, 'to', p_status))
  );

  return jsonb_build_object('status', p_status, 'changed', true);
end;
$$;

grant execute on function public.update_order_status(uuid, public.order_status, text) to authenticated;

-- Customers may cancel their own order, but only while nothing has shipped.
create or replace function public.cancel_my_order(p_order_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_user uuid := (select auth.uid());
  v_item record;
begin
  if v_user is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and user_id = v_user for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status not in ('placed', 'confirmed') then
    raise exception 'too_late_to_cancel' using errcode = 'P0001';
  end if;

  for v_item in select product_id, variant_id, quantity from public.order_items where order_id = p_order_id
  loop
    if v_item.variant_id is not null then
      update public.product_variants set stock = stock + v_item.quantity where id = v_item.variant_id;
    elsif v_item.product_id is not null then
      update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
    end if;
    if v_item.product_id is not null then
      update public.products set units_sold = greatest(0, units_sold - v_item.quantity)
      where id = v_item.product_id;
    end if;
  end loop;

  update public.orders
     set status = 'cancelled', cancelled_at = now(),
         cancel_reason = coalesce(p_reason, 'Cancelled by customer'),
         payment_status = case when payment_status = 'pending'
                               then 'cancelled'::public.payment_status
                               else payment_status end
   where id = p_order_id;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (p_order_id, 'cancelled', coalesce(p_reason, 'Cancelled by customer'), v_user);

  return jsonb_build_object('status', 'cancelled');
end;
$$;

grant execute on function public.cancel_my_order(uuid, text) to authenticated;

-- ── Guest order tracking ────────────────────────────────────────────────────
-- Order number alone is guessable (it is a sequence), so tracking requires the
-- phone number on the order as a second factor. Returns only what the tracking
-- page renders — never the internal note or cost figures.
create or replace function public.track_order(p_order_number text, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if length(v_phone) = 13 and left(v_phone, 3) = '880' then
    v_phone := substr(v_phone, 4);
  elsif length(v_phone) = 11 and left(v_phone, 1) = '0' then
    v_phone := v_phone;
  elsif length(v_phone) = 10 and left(v_phone, 1) = '1' then
    v_phone := '0' || v_phone;
  end if;

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

-- ── Payment settlement (service role only) ──────────────────────────────────
-- Called from verified webhook / callback handlers after the gateway response
-- has been authenticated server-side. Idempotent: a replayed callback with the
-- same provider_txn_id is a no-op.
create or replace function public.settle_payment(
  p_payment_id uuid,
  p_status public.payment_status,
  p_provider_txn_id text default null,
  p_failure_reason text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments;
  v_order public.orders;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  -- Already settled successfully: ignore anything that is not a refund.
  if v_payment.status = 'successful' and p_status <> 'refunded' then
    return jsonb_build_object('status', v_payment.status, 'changed', false);
  end if;

  update public.payments
     set status = p_status,
         provider_txn_id = coalesce(p_provider_txn_id, provider_txn_id),
         failure_reason = case when p_status in ('failed', 'cancelled')
                               then p_failure_reason else null end,
         settled_at = case when p_status in ('successful', 'refunded') then now() else settled_at end
   where id = p_payment_id;

  insert into public.payment_transactions (payment_id, event, status, amount_paisa, payload)
  values (p_payment_id, 'settle', p_status, v_payment.amount_paisa, coalesce(p_payload, '{}'::jsonb));

  update public.orders
     set payment_status = p_status
   where id = v_payment.order_id
   returning * into v_order;

  -- A successful online payment auto-confirms the order.
  if p_status = 'successful' and v_order.status = 'placed' then
    update public.orders set status = 'confirmed', confirmed_at = now()
    where id = v_order.id;
    insert into public.order_status_history (order_id, status, note)
    values (v_order.id, 'confirmed', 'Payment verified');
  end if;

  -- A failed online payment releases the reserved stock so the units are not
  -- stranded by an abandoned gateway session.
  if p_status in ('failed', 'cancelled') and v_order.status = 'placed' then
    perform public.release_order_stock(v_order.id);
    update public.orders
       set status = 'cancelled', cancelled_at = now(),
           cancel_reason = coalesce(p_failure_reason, 'Payment not completed')
     where id = v_order.id;
    insert into public.order_status_history (order_id, status, note)
    values (v_order.id, 'cancelled', coalesce(p_failure_reason, 'Payment not completed'));
  end if;

  return jsonb_build_object('status', p_status, 'changed', true, 'order_id', v_payment.order_id);
end;
$$;

create or replace function public.release_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
begin
  for v_item in select product_id, variant_id, quantity from public.order_items where order_id = p_order_id
  loop
    if v_item.variant_id is not null then
      update public.product_variants set stock = stock + v_item.quantity where id = v_item.variant_id;
    elsif v_item.product_id is not null then
      update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
    end if;
    if v_item.product_id is not null then
      update public.products set units_sold = greatest(0, units_sold - v_item.quantity)
      where id = v_item.product_id;
    end if;
  end loop;
end;
$$;

-- Neither of these is callable with an anon or authenticated JWT. Only the
-- service role (used by webhook routes) may execute them.
revoke all on function public.settle_payment(uuid, public.payment_status, text, text, jsonb) from anon, authenticated;
revoke all on function public.release_order_stock(uuid) from anon, authenticated;

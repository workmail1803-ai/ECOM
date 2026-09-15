-- ============================================================================
-- 0020  Spend store credit at checkout
-- ============================================================================
-- Referral rewards are paid as credit, and credit nobody can spend is not a
-- reward. This lets it come off an order.
--
-- `total_paisa` is NOT reduced. The order is worth what it is worth, and the
-- schema already checks total = subtotal - discount + delivery; credit is
-- recorded alongside as the part that was settled from the balance. The split
-- that has to hold is therefore advance + due + credit = total.
--
-- Idempotent.

alter table public.orders
  add column if not exists credit_applied_paisa integer not null default 0;

alter table public.orders drop constraint if exists orders_credit_nonneg;
alter table public.orders
  add constraint orders_credit_nonneg check (credit_applied_paisa >= 0);

-- Widen the 0017 split to account for credit.
alter table public.orders drop constraint if exists orders_advance_split;
alter table public.orders
  add constraint orders_advance_split check (
    advance_paisa >= 0
    and due_on_delivery_paisa >= 0
    and advance_paisa + due_on_delivery_paisa + credit_applied_paisa = total_paisa
  );

-- Re-created to settle part of the order from the ledger.
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
  p_save_address boolean default false,
  -- Pay a slice now and the rest to the courier. Defaults false, so every
  -- existing caller keeps the full-payment behaviour unchanged.
  p_partial_payment boolean default false,
  -- Spend the signed-in customer's store credit on this order.
  p_use_credit boolean default false
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
  v_adv_cfg jsonb;
  v_advance integer := 0;
  v_due integer := 0;
  v_total integer;
  v_payable integer;
  v_credit integer := 0;
  v_balance integer := 0;
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

  -- ── Advance / partial payment ─────────────────────────────────────────────
  -- The rule and its floor live in settings, not in code, and the split is
  -- computed HERE rather than sent by the client: the amount collected up
  -- front is money, and money is decided in Postgres.
  --
  -- Advance = a percentage of the SUBTOTAL plus the WHOLE delivery charge.
  -- Delivery is not discounted pro-rata because we pay the courier in full
  -- whether or not the customer has settled the rest.
  v_total := (v_quote ->> 'total_paisa')::integer;

  -- ── Store credit ──────────────────────────────────────────────────────────
  -- The order stays worth what it is worth; credit SETTLES part of it. So
  -- total_paisa is untouched (it must still equal subtotal - discount +
  -- delivery, which the schema checks) and the credit is recorded beside it.
  -- What remains to collect is `v_payable`.
  --
  -- The balance is read here, never taken from the request: a client that
  -- could name its own balance could pay for anything. The advisory lock
  -- serialises spending per customer — row locks would not do, because
  -- `for update` is not allowed with an aggregate and locking existing rows
  -- would not stop a concurrent transaction inserting another.
  if p_use_credit and v_user is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

    select coalesce(sum(delta_paisa), 0)::integer into v_balance
      from public.credit_ledger where user_id = v_user;

    v_credit := greatest(0, least(v_balance, v_total));
  end if;

  v_payable := v_total - v_credit;

  select value into v_adv_cfg from public.settings where key = 'advance_payment';

  if p_partial_payment
     and coalesce((v_adv_cfg ->> 'enabled')::boolean, false)
     and p_payment_method <> 'cod'
  then
    v_advance :=
      round(
        (v_quote ->> 'subtotal_paisa')::numeric
        * coalesce((v_adv_cfg ->> 'percent')::numeric, 10) / 100
      )::integer
      + (v_quote ->> 'delivery_fee_paisa')::integer;

    -- Floor: a tk 12 advance costs more in gateway fees than it secures.
    v_advance := greatest(v_advance, coalesce((v_adv_cfg ->> 'min_paisa')::integer, 20000));
    -- …and never more than the order is worth.
    v_advance := least(v_advance, v_payable);
    v_due := v_payable - v_advance;

  elsif p_payment_method = 'cod' then
    -- Nothing up front; the courier collects whatever credit did not cover.
    v_advance := 0;
    v_due := v_payable;
  else
    -- Paid in full before dispatch.
    v_advance := v_payable;
    v_due := 0;
  end if;

  insert into public.orders (
    user_id,
    customer_name, customer_phone, customer_email,
    shipping_district, shipping_area, shipping_street, shipping_postcode, shipping_landmark,
    address_id,
    delivery_zone_id, delivery_zone_name, delivery_min_days, delivery_max_days,
    subtotal_paisa, discount_paisa, delivery_fee_paisa, total_paisa,
    advance_paisa, due_on_delivery_paisa, credit_applied_paisa,
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
    v_advance, v_due, v_credit,
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

  if v_credit > 0 then
    insert into public.credit_ledger (user_id, delta_paisa, reason, order_id)
    values (v_user, -v_credit, 'Applied to order ' || v_order.order_number, v_order.id);
  end if;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (v_order.id, 'placed', 'Order received', v_user);

  insert into public.payments (order_id, provider, status, amount_paisa)
  values (
    v_order.id,
    p_payment_method,
    case when p_payment_method = 'cod' then 'pending'::public.payment_status
         else 'initiated'::public.payment_status end,
    -- What is being collected NOW. On a partial order that is the advance,
    -- not the total — recording the total here would mark the order fully
    -- paid the moment the advance cleared.
    case when v_advance > 0 then v_advance else v_payable end
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
    'advance_paisa', v_order.advance_paisa,
    'credit_applied_paisa', v_order.credit_applied_paisa,
    'due_on_delivery_paisa', v_order.due_on_delivery_paisa,
    'payment_status', v_order.payment_status,
    'status', v_order.status
  );
end;
$$;

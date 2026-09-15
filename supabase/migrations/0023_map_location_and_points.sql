-- ============================================================================
-- 0023  Map coordinates on orders, and product points
-- ============================================================================
-- Two features in one migration on purpose. Both need a new place_order
-- argument, and 0022 exists because three separate migrations each appended
-- one and left four overloads behind. Doing them together means ONE signature
-- change, and the old signature is dropped explicitly below rather than being
-- left for `create or replace` to miss.
--
-- 1. Coordinates
--    The courier is given a pin, not a district guess. Latitude and longitude
--    are stored beside the written address, never instead of it: GPS can be
--    refused, stale or twenty metres into the next building, and a human
--    still has to read the address at the door.
--
-- 2. Points
--    Each product carries the points a purchase earns. Points are awarded when
--    an order is DELIVERED -- the same rule the referral payout uses in 0019,
--    and for the same reason: awarding on placement pays out on orders that
--    come back refused.
--
--    Redemption converts points to money at a rate held in settings, is capped
--    at what the order is actually worth, and is computed in place_order. A
--    balance can never go negative because the spend is `least(balance, ...)`
--    under a lock.
--
-- Idempotent.

-- ── Coordinates ─────────────────────────────────────────────────────────────
alter table public.orders
  add column if not exists shipping_lat numeric(9, 6),
  add column if not exists shipping_lng numeric(9, 6),
  -- Whatever the geocoder called the spot, kept verbatim for the courier.
  add column if not exists shipping_place_label text;

alter table public.addresses
  add column if not exists lat numeric(9, 6),
  add column if not exists lng numeric(9, 6);

-- Reject impossible coordinates rather than storing them and sending a courier
-- to the middle of the Atlantic.
alter table public.orders drop constraint if exists orders_coords_sane;
alter table public.orders
  add constraint orders_coords_sane check (
    (shipping_lat is null and shipping_lng is null)
    or (
      shipping_lat between -90 and 90
      and shipping_lng between -180 and 180
    )
  );

alter table public.addresses drop constraint if exists addresses_coords_sane;
alter table public.addresses
  add constraint addresses_coords_sane check (
    (lat is null and lng is null)
    or (lat between -90 and 90 and lng between -180 and 180)
  );

-- ── Points ──────────────────────────────────────────────────────────────────
alter table public.products
  add column if not exists points_per_purchase integer not null default 0;

alter table public.products drop constraint if exists products_points_nonneg;
alter table public.products
  add constraint products_points_nonneg check (points_per_purchase >= 0);

-- Snapshot on the line, like every other figure an invoice needs: changing a
-- product's points later must not rewrite what an old order earned.
alter table public.order_items
  add column if not exists points_per_unit integer not null default 0;

alter table public.orders
  add column if not exists points_redeemed_paisa integer not null default 0;

alter table public.orders drop constraint if exists orders_points_redeemed_nonneg;
alter table public.orders
  add constraint orders_points_redeemed_nonneg check (points_redeemed_paisa >= 0);

-- Widen the split once more. Points are a fifth way an order gets settled, so
-- everything that settles it still has to add up to exactly what it is worth.
alter table public.orders drop constraint if exists orders_advance_split;
alter table public.orders
  add constraint orders_advance_split check (
    advance_paisa >= 0
    and due_on_delivery_paisa >= 0
    and advance_paisa + due_on_delivery_paisa + credit_applied_paisa
        + credit_account_paisa + points_redeemed_paisa = total_paisa
  );

-- Append-only, same shape as credit_ledger. Positive earns, negative spends.
create table if not exists public.points_ledger (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  delta_points integer not null,
  reason       text not null,
  order_id     uuid references public.orders (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint points_ledger_nonzero check (delta_points <> 0)
);

create index if not exists points_ledger_user
  on public.points_ledger (user_id, created_at desc);

-- One EARN row per order, so replaying a delivery cannot pay twice. Spends are
-- not covered by this index because an order redeems at most once anyway, and
-- that is enforced where it is written.
create unique index if not exists points_ledger_earn_once
  on public.points_ledger (order_id)
  where delta_points > 0 and order_id is not null;

insert into public.settings (key, value, description, is_public) values
  ('points_rules',
   '{"enabled": true, "paisa_per_point": 100, "min_redeem_points": 100}'::jsonb,
   'What a point is worth in paisa when redeemed, and the smallest redemption allowed.',
   true)
on conflict (key) do nothing;

alter table public.points_ledger enable row level security;

-- Read-only to the customer. Every write goes through a SECURITY DEFINER
-- function: anyone who can INSERT here can mint money.
drop policy if exists points_ledger_own on public.points_ledger;
create policy points_ledger_own on public.points_ledger
  for select using (user_id = (select auth.uid()) or public.is_staff());

create or replace function public.points_balance(p_user uuid default null)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(delta_points), 0)::integer
    from public.points_ledger
   where user_id = coalesce(p_user, (select auth.uid()));
$$;

-- ── Award on delivery ───────────────────────────────────────────────────────
create or replace function public.award_points_for_order(p_order uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_points integer;
  v_cfg jsonb;
begin
  select * into v_order from public.orders where id = p_order;

  -- Guests earn nothing: there is no account to hold the balance.
  if v_order.id is null or v_order.user_id is null or v_order.status <> 'delivered' then
    return 0;
  end if;

  select value into v_cfg from public.settings where key = 'points_rules';
  if not coalesce((v_cfg ->> 'enabled')::boolean, false) then
    return 0;
  end if;

  -- From the line snapshot, not from the product, so a later price or points
  -- change does not rewrite history.
  select coalesce(sum(oi.points_per_unit * oi.quantity), 0)::integer
    into v_points
    from public.order_items oi
   where oi.order_id = p_order;

  if v_points <= 0 then
    return 0;
  end if;

  insert into public.points_ledger (user_id, delta_points, reason, order_id)
  values (v_order.user_id, v_points, 'Earned on order ' || v_order.order_number, p_order)
  on conflict do nothing;

  return v_points;
end;
$$;

-- Fires alongside the referral payout from 0019, on the same transition.
create or replace function public.tg_points_on_delivered()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    perform public.award_points_for_order(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists points_on_delivered on public.orders;
create trigger points_on_delivered
  after update of status on public.orders
  for each row execute function public.tg_points_on_delivered();

grant execute on function public.points_balance(uuid) to authenticated;
revoke all on function public.award_points_for_order(uuid) from anon, authenticated;

-- The 0021 signature. Dropped explicitly, because `create or replace` below
-- adds arguments and would otherwise leave a second overload behind — which is
-- exactly what broke order placement and required 0022.
drop function if exists public.place_order(
  uuid, text, text, text, text, text, text, text, text,
  public.payment_method, text, uuid, text, boolean, boolean, boolean, boolean
);

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
  p_use_credit boolean default false,
  -- Put what is left on the customer's credit account, if they have one.
  p_use_credit_account boolean default false,
  -- Where the courier is actually going. Optional: GPS can be refused, and a
  -- written address still has to work on its own.
  p_lat numeric default null,
  p_lng numeric default null,
  p_place_label text default null,
  -- Spend points on this order. An intent, not an amount.
  p_redeem_points boolean default false
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
  v_account integer := 0;
  v_acct_limit integer := 0;
  v_acct_drawn integer := 0;
  v_acct_available integer := 0;
  v_window integer;
  v_points_cfg jsonb;
  v_points_balance integer := 0;
  v_points_spent integer := 0;
  v_points_paisa integer := 0;
  v_balance integer := 0;
  v_line jsonb;
  v_zone public.delivery_zones;
  v_order public.orders;
  v_coupon_id uuid;
  v_coupon_code text;
  v_phone text := public.normalise_bd_phone(p_customer_phone);
  v_payment_status public.payment_status;
begin
  v_cart := public.assert_cart_access(p_cart_id, p_guest_token);

  -- Normalise the phone the same way the table triggers would, so validation

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
  select coalesce((value ->> 'minutes')::integer, 30) into v_window
    from public.settings where key = 'payment_window';

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

  -- ── Points ────────────────────────────────────────────────────────────────
  -- Converted at the rate in settings, capped at what is still owed, and
  -- floored by a minimum so a two-point redemption is not worth the paperwork.
  -- `least(balance, ...)` under the lock is what makes a negative balance
  -- impossible, whatever the client asks for.
  if p_redeem_points and v_user is not null and v_payable > 0 then
    select value into v_points_cfg from public.settings where key = 'points_rules';

    if coalesce((v_points_cfg ->> 'enabled')::boolean, false) then
      perform pg_advisory_xact_lock(hashtextextended('points:' || v_user::text, 0));

      select coalesce(sum(delta_points), 0)::integer into v_points_balance
        from public.points_ledger where user_id = v_user;

      if v_points_balance >= coalesce((v_points_cfg ->> 'min_redeem_points')::integer, 0) then
        -- How many points the remaining balance could actually absorb.
        v_points_spent := least(
          v_points_balance,
          v_payable / greatest(1, coalesce((v_points_cfg ->> 'paisa_per_point')::integer, 100))
        );
        v_points_paisa := v_points_spent
          * coalesce((v_points_cfg ->> 'paisa_per_point')::integer, 100);
        v_payable := v_payable - v_points_paisa;
      end if;
    end if;
  end if;

  -- ── Credit account ────────────────────────────────────────────────────────
  -- Trade credit: the shop carries the customer, who settles later. Kept in
  -- its own ledger rather than mixed with store credit, because they point in
  -- opposite directions — one is money we owe them, the other money they owe
  -- us, and a single "balance" spanning both would be meaningless.
  --
  -- Keyed on the normalised phone, which is how a shop actually knows a
  -- regular. The available figure is computed here under a lock, never sent.
  if p_use_credit_account and v_payable > 0 then
    perform pg_advisory_xact_lock(hashtextextended('credit:' || v_phone, 0));

    select ca.limit_paisa into v_acct_limit
      from public.credit_accounts ca
     where ca.phone = v_phone and ca.is_active;

    if v_acct_limit is not null then
      select coalesce(sum(l.delta_paisa), 0)::integer into v_acct_drawn
        from public.credit_account_ledger l where l.phone = v_phone;

      -- drawn is zero or negative; adding it to the limit gives headroom.
      v_acct_available := greatest(0, v_acct_limit + v_acct_drawn);
      v_account := least(v_payable, v_acct_available);
      v_payable := v_payable - v_account;
    end if;
  end if;

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
    advance_paisa, due_on_delivery_paisa, credit_applied_paisa, credit_account_paisa, payment_due_at,
    points_redeemed_paisa, shipping_lat, shipping_lng, shipping_place_label,
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
    v_advance, v_due, v_credit, v_account,
    case
      when p_payment_method <> 'cod' and v_advance > 0
      then now() + make_interval(mins => coalesce(v_window, 30))
      else null
    end,
    v_points_paisa,
    p_lat, p_lng, nullif(trim(coalesce(p_place_label, '')), ''),
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
      unit_price_paisa, quantity, line_total_paisa, points_per_unit
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
      (v_line ->> 'line_total_paisa')::integer,
      -- Snapshot: what this product earns TODAY. Editing the product later
      -- must not rewrite what an old order was worth.
      coalesce((
        select pr.points_per_purchase from public.products pr
         where pr.id = (v_line ->> 'product_id')::uuid
      ), 0)
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

  if v_points_spent > 0 then
    insert into public.points_ledger (user_id, delta_points, reason, order_id)
    values (v_user, -v_points_spent, 'Redeemed on order ' || v_order.order_number, v_order.id);
  end if;

  if v_account > 0 then
    insert into public.credit_account_ledger (phone, delta_paisa, reason, order_id)
    values (v_phone, -v_account, 'Order ' || v_order.order_number, v_order.id);
  end if;

  if v_credit > 0 then
    insert into public.credit_ledger (user_id, delta_paisa, reason, order_id)
    values (v_user, -v_credit, 'Applied to order ' || v_order.order_number, v_order.id);
  end if;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (v_order.id, 'placed', 'Order received', v_user);

  -- What is being collected NOW. On a partial order that is the advance, not
  -- the total — recording the total here would mark the order fully paid the
  -- moment the advance cleared.
  --
  -- Nothing at all may be left to collect: store credit or a credit account
  -- can cover the order outright. `payments_amount_positive` rejects a zero
  -- row, and rightly — a payment of nothing is not a payment, so none is
  -- written and the settlement is the ledger entry instead.
  if (case when v_advance > 0 then v_advance else v_payable end) > 0 then
    insert into public.payments (order_id, provider, status, amount_paisa)
    values (
      v_order.id,
      p_payment_method,
      case when p_payment_method = 'cod' then 'pending'::public.payment_status
           else 'initiated'::public.payment_status end,
      case when v_advance > 0 then v_advance else v_payable end
    );
  end if;

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
    'credit_account_paisa', v_order.credit_account_paisa,
    'points_redeemed_paisa', v_order.points_redeemed_paisa,
    'points_spent', v_points_spent,
    'payment_due_at', v_order.payment_due_at,
    'due_on_delivery_paisa', v_order.due_on_delivery_paisa,
    'payment_status', v_order.payment_status,
    'status', v_order.status
  );
end;
$$;
grant execute on function public.place_order(
  uuid, text, text, text, text, text, text, text, text,
  public.payment_method, text, uuid, text, boolean, boolean, boolean, boolean,
  numeric, numeric, text, boolean
) to anon, authenticated;

-- Guard: one signature, always. This is what 0022 had to clean up.
do $$
declare v_count integer;
begin
  select count(*) into v_count from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_order';
  if v_count <> 1 then
    raise exception 'place_order must have exactly one signature, found %', v_count;
  end if;
end;
$$;

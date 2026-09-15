-- ============================================================================
-- 0021  Credit accounts, and a payment window
-- ============================================================================
-- Two things the client asked for:
--
--   "Use Credit"     a regular customer buys on account and settles later.
--                    Looked up by PHONE, because that is how a shop actually
--                    knows a regular -- they may never have made a login.
--   "Pay in 30 min"  a prepaid order that is not paid inside the window is
--                    cancelled, and the stock goes back.
--
-- Trade credit is kept in its own ledger rather than mixed with the store
-- credit from 0019. They point in opposite directions -- store credit is money
-- the shop owes the customer, an account balance is money the customer owes
-- the shop -- and one combined "balance" spanning both would mean nothing.
--
-- This migration also RESTORES the phone fix from 0014. Migrations 0016, 0017
-- and 0020 each rebuilt place_order from the 0010 text, which silently put the
-- old if/elsif chain back: a number written +8801712345678 lost its leading
-- zero and was then rejected as invalid at checkout. place_order now calls the
-- shared normalise_bd_phone() helper, so there is no second copy to drift.
--
-- Idempotent.

create table if not exists public.credit_accounts (
  -- Normalised BD mobile, the same shape orders and profiles store.
  phone       text primary key,
  user_id     uuid references auth.users (id) on delete set null,
  holder_name text,
  limit_paisa integer not null default 0,
  is_active   boolean not null default true,
  note        text,
  approved_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint credit_accounts_phone_shape check (phone ~ '^01[3-9][0-9]{8}$'),
  constraint credit_accounts_limit_nonneg check (limit_paisa >= 0)
);

drop trigger if exists set_updated_at on public.credit_accounts;
create trigger set_updated_at before update on public.credit_accounts
  for each row execute function public.tg_set_updated_at();

-- Append-only, like the store-credit ledger and for the same reason: a
-- mutable "outstanding" column can be lost to a race or quietly edited.
-- Negative is drawn, positive is repaid.
create table if not exists public.credit_account_ledger (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null references public.credit_accounts (phone) on delete cascade,
  delta_paisa integer not null,
  reason      text not null,
  order_id    uuid references public.orders (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint credit_account_ledger_nonzero check (delta_paisa <> 0)
);

create index if not exists credit_account_ledger_phone
  on public.credit_account_ledger (phone, created_at desc);

alter table public.orders
  add column if not exists credit_account_paisa integer not null default 0,
  add column if not exists payment_due_at timestamptz;

alter table public.orders drop constraint if exists orders_credit_account_nonneg;
alter table public.orders
  add constraint orders_credit_account_nonneg check (credit_account_paisa >= 0);

-- Widen the split again: account credit is a third way an order gets settled.
alter table public.orders drop constraint if exists orders_advance_split;
alter table public.orders
  add constraint orders_advance_split check (
    advance_paisa >= 0
    and due_on_delivery_paisa >= 0
    and advance_paisa + due_on_delivery_paisa + credit_applied_paisa
        + credit_account_paisa = total_paisa
  );

insert into public.settings (key, value, description, is_public) values
  ('payment_window',
   '{"minutes": 30}'::jsonb,
   'How long a prepaid order may sit unpaid before it is cancelled automatically.',
   true)
on conflict (key) do nothing;

-- ── Lookup, for the checkout "Check Credit" button ──────────────────────────
-- Returns only what the caller already knows plus their own headroom. It is
-- SECURITY DEFINER so a guest can check, and it reports nothing at all about
-- an account that is not active.
create or replace function public.check_credit_account(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := public.normalise_bd_phone(p_phone);
  v_acct public.credit_accounts;
  v_drawn integer;
begin
  if v_phone !~ '^01[3-9][0-9]{8}$' then
    return jsonb_build_object('found', false);
  end if;

  select * into v_acct from public.credit_accounts
   where phone = v_phone and is_active;

  if v_acct.phone is null then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(sum(delta_paisa), 0)::integer into v_drawn
    from public.credit_account_ledger where phone = v_phone;

  return jsonb_build_object(
    'found', true,
    'holder_name', v_acct.holder_name,
    'limit_paisa', v_acct.limit_paisa,
    'outstanding_paisa', -v_drawn,
    'available_paisa', greatest(0, v_acct.limit_paisa + v_drawn)
  );
end;
$$;

-- ── Expiry ──────────────────────────────────────────────────────────────────
-- Cancels prepaid orders whose window has passed, releasing stock and writing
-- history exactly as a human cancellation would.
create or replace function public.expire_unpaid_orders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select o.id
      from public.orders o
     where o.payment_due_at is not null
       and o.payment_due_at < now()
       and o.status = 'placed'
       and o.payment_status in ('pending', 'initiated')
       -- An order already part-settled is a conversation, not a lapse.
       and o.credit_applied_paisa = 0
       and o.credit_account_paisa = 0
     for update skip locked
  loop
    perform public.release_order_stock(v_order.id);

    update public.orders
       set status = 'cancelled',
           cancelled_at = now(),
           cancel_reason = 'Payment window expired',
           payment_status = 'failed'
     where id = v_order.id;

    insert into public.order_status_history (order_id, status, note)
    values (v_order.id, 'cancelled', 'Not paid within the payment window');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

alter table public.credit_accounts       enable row level security;
alter table public.credit_account_ledger enable row level security;

-- Customers never read these directly; check_credit_account is the only door,
-- and it answers about one phone at a time.
drop policy if exists credit_accounts_staff on public.credit_accounts;
create policy credit_accounts_staff on public.credit_accounts
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists credit_account_ledger_staff on public.credit_account_ledger;
create policy credit_account_ledger_staff on public.credit_account_ledger
  for all using (public.is_staff()) with check (public.is_staff());

grant execute on function public.check_credit_account(text) to anon, authenticated;
revoke all on function public.expire_unpaid_orders() from anon, authenticated;

-- Re-created for credit accounts, the payment window, and the restored phone
-- helper.
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
  p_use_credit_account boolean default false
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
    'payment_due_at', v_order.payment_due_at,
    'due_on_delivery_paisa', v_order.due_on_delivery_paisa,
    'payment_status', v_order.payment_status,
    'status', v_order.status
  );
end;
$$;
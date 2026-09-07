-- ============================================================================
-- 0006  Orders, order items, status history, payments, reviews, audit
-- ============================================================================

-- Human-facing order numbers come from a sequence, not a random string, so
-- support can read them over the phone: BD-100001.
create sequence if not exists public.order_number_seq start with 100001;

create table if not exists public.orders (
  id                   uuid primary key default gen_random_uuid(),
  order_number         text not null default 'BD-' || nextval('public.order_number_seq'),
  user_id              uuid references auth.users (id) on delete set null,

  -- Contact details are SNAPSHOTTED, not joined. An order must still be
  -- readable and shippable if the customer later edits or deletes the address.
  customer_name        text not null,
  customer_phone       text not null,
  customer_email       text,
  shipping_district    text not null,
  shipping_area        text not null,
  shipping_street      text not null,
  shipping_postcode    text,
  shipping_landmark    text,
  address_id           uuid references public.addresses (id) on delete set null,

  status               public.order_status not null default 'placed',

  delivery_zone_id     uuid references public.delivery_zones (id) on delete set null,
  delivery_zone_name   text not null,
  delivery_min_days    integer not null default 1,
  delivery_max_days    integer not null default 3,

  -- Every figure below is computed by place_order() from live catalog data.
  subtotal_paisa       integer not null,
  discount_paisa       integer not null default 0,
  delivery_fee_paisa   integer not null default 0,
  total_paisa          integer not null,

  coupon_id            uuid references public.coupons (id) on delete set null,
  coupon_code          text,

  payment_method       public.payment_method not null,
  payment_status       public.payment_status not null default 'pending',

  customer_note        text,
  internal_note        text,

  placed_at            timestamptz not null default now(),
  confirmed_at         timestamptz,
  shipped_at           timestamptz,
  delivered_at         timestamptz,
  cancelled_at         timestamptz,
  cancel_reason        text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint orders_amounts_nonneg check (
    subtotal_paisa >= 0
    and discount_paisa >= 0
    and delivery_fee_paisa >= 0
    and total_paisa >= 0
  ),
  -- The invariant that makes tampering detectable at the storage layer.
  constraint orders_total_consistent check (
    total_paisa = subtotal_paisa - discount_paisa + delivery_fee_paisa
  ),
  constraint orders_discount_within_subtotal check (discount_paisa <= subtotal_paisa),
  constraint orders_phone_bd_format check (customer_phone ~ '^01[3-9][0-9]{8}$')
);

create unique index if not exists orders_number_key on public.orders (order_number);
-- Customer "my orders", newest first.
create index if not exists orders_user_idx on public.orders (user_id, placed_at desc);
-- Admin queue filtered by status.
create index if not exists orders_status_idx on public.orders (status, placed_at desc);
-- Admin dashboard date-range scans and revenue rollups.
create index if not exists orders_placed_at_idx on public.orders (placed_at desc);
-- Support looks orders up by phone constantly.
create index if not exists orders_phone_idx on public.orders (customer_phone);
-- Reconciliation: unpaid online orders.
create index if not exists orders_payment_status_idx
  on public.orders (payment_status, placed_at desc)
  where payment_status <> 'successful';

drop trigger if exists set_updated_at on public.orders;
create trigger set_updated_at before update on public.orders
  for each row execute function public.tg_set_updated_at();

create table if not exists public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  -- Product may later be deleted; the line must survive, so SET NULL and keep
  -- the denormalised snapshot below.
  product_id       uuid references public.products (id) on delete set null,
  variant_id       uuid references public.product_variants (id) on delete set null,
  product_name     text not null,
  variant_name     text,
  sku              text not null,
  image_url        text,
  unit_price_paisa integer not null,
  quantity         integer not null,
  line_total_paisa integer not null,
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_price_nonneg check (unit_price_paisa >= 0),
  constraint order_items_line_total_consistent check (
    line_total_paisa = unit_price_paisa * quantity
  )
);
create index if not exists order_items_order_idx on public.order_items (order_id);
-- "How many of X did we sell" for the product performance report.
create index if not exists order_items_product_idx
  on public.order_items (product_id) where product_id is not null;

create table if not exists public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  status      public.order_status not null,
  note        text,
  changed_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists order_status_history_order_idx
  on public.order_status_history (order_id, created_at);

-- Close the loop left open in 0005.
do $$ begin
  alter table public.coupon_usage
    add constraint coupon_usage_order_fk
    foreign key (order_id) references public.orders (id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists coupon_usage_order_idx
  on public.coupon_usage (order_id) where order_id is not null;

-- ── Payments ────────────────────────────────────────────────────────────────
-- One `payments` row per attempt at paying an order; `payment_transactions`
-- records every gateway interaction for audit and dispute handling.
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  provider        public.payment_method not null,
  status          public.payment_status not null default 'initiated',
  amount_paisa    integer not null,
  currency        text not null default 'BDT',
  -- Gateway's own id for the payment session (bKash paymentID, Nagad paymentRefId…)
  provider_ref    text,
  -- Final settled transaction id (bKash trxID, card bank_tran_id…)
  provider_txn_id text,
  failure_reason  text,
  -- Idempotency guard for webhook/callback replays.
  idempotency_key text,
  initiated_at    timestamptz not null default now(),
  settled_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint payments_amount_positive check (amount_paisa > 0)
);
create index if not exists payments_order_idx on public.payments (order_id);
create unique index if not exists payments_provider_ref_key
  on public.payments (provider, provider_ref) where provider_ref is not null;
create unique index if not exists payments_idempotency_key
  on public.payments (idempotency_key) where idempotency_key is not null;
create index if not exists payments_pending_idx
  on public.payments (status, initiated_at) where status in ('initiated', 'pending');

drop trigger if exists set_updated_at on public.payments;
create trigger set_updated_at before update on public.payments
  for each row execute function public.tg_set_updated_at();

create table if not exists public.payment_transactions (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.payments (id) on delete cascade,
  event       text not null,             -- create | execute | query | webhook | refund
  status      public.payment_status,
  amount_paisa integer,
  -- Raw gateway payload, redacted of card data before insert.
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists payment_transactions_payment_idx
  on public.payment_transactions (payment_id, created_at);

-- ── Reviews ─────────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  order_id     uuid references public.orders (id) on delete set null,
  rating       smallint not null,
  title        text,
  body         text,
  -- Set by trigger from delivered order history — never from the client.
  is_verified_purchase boolean not null default false,
  status       public.review_status not null default 'pending',
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reviews_rating_range check (rating between 1 and 5)
);
-- One review per customer per product.
create unique index if not exists reviews_user_product_key
  on public.reviews (user_id, product_id);
-- Public PDP read path: approved reviews for a product, newest first.
create index if not exists reviews_product_approved_idx
  on public.reviews (product_id, created_at desc)
  where status = 'approved';
-- Admin moderation queue.
create index if not exists reviews_moderation_idx
  on public.reviews (status, created_at) where status = 'pending';
create index if not exists reviews_user_idx on public.reviews (user_id);

drop trigger if exists set_updated_at on public.reviews;
create trigger set_updated_at before update on public.reviews
  for each row execute function public.tg_set_updated_at();

create table if not exists public.review_images (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.reviews (id) on delete cascade,
  url        text not null,
  created_at timestamptz not null default now()
);
create index if not exists review_images_review_idx on public.review_images (review_id);

-- Rating rollup. Maintained incrementally on the products row so the PDP and
-- every product card can show a rating without touching the reviews table.
-- Only APPROVED reviews count.
create or replace function public.tg_reviews_rollup()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  old_counts boolean := (tg_op <> 'INSERT') and old.status = 'approved';
  new_counts boolean := (tg_op <> 'DELETE') and new.status = 'approved';
begin
  if tg_op = 'UPDATE' and old.product_id <> new.product_id then
    if old_counts then
      update public.products
        set rating_sum = greatest(0, rating_sum - old.rating),
            rating_count = greatest(0, rating_count - 1)
      where id = old.product_id;
    end if;
    if new_counts then
      update public.products
        set rating_sum = rating_sum + new.rating, rating_count = rating_count + 1
      where id = new.product_id;
    end if;
    return null;
  end if;

  if old_counts and new_counts then
    if old.rating <> new.rating then
      update public.products
        set rating_sum = greatest(0, rating_sum - old.rating + new.rating)
      where id = new.product_id;
    end if;
  elsif old_counts and not new_counts then
    update public.products
      set rating_sum = greatest(0, rating_sum - old.rating),
          rating_count = greatest(0, rating_count - 1)
    where id = old.product_id;
  elsif new_counts and not old_counts then
    update public.products
      set rating_sum = rating_sum + new.rating, rating_count = rating_count + 1
    where id = new.product_id;
  end if;

  return null;
end;
$$;

drop trigger if exists reviews_rollup on public.reviews;
create trigger reviews_rollup after insert or update or delete on public.reviews
  for each row execute function public.tg_reviews_rollup();

-- Verified-purchase flag, decided in the database from delivered orders.
create or replace function public.tg_reviews_verify_purchase()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_order uuid;
begin
  select o.id into matched_order
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.user_id = new.user_id
    and oi.product_id = new.product_id
    and o.status = 'delivered'
  order by o.delivered_at desc nulls last
  limit 1;

  new.is_verified_purchase := matched_order is not null;
  new.order_id := coalesce(new.order_id, matched_order);
  return new;
end;
$$;

drop trigger if exists reviews_verify_purchase on public.reviews;
create trigger reviews_verify_purchase
  before insert or update of product_id, user_id on public.reviews
  for each row execute function public.tg_reviews_verify_purchase();

-- ── Audit log ───────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,             -- product.update, order.status_change …
  entity_type text not null,
  entity_id   text,
  -- Only the changed fields, as {field: {from, to}}.
  changes     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
-- Bigserial PK already gives us newest-first via a backwards scan. Entity
-- lookup is the other access path.
create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);
create index if not exists audit_log_actor_idx
  on public.audit_log (actor_id, created_at desc) where actor_id is not null;

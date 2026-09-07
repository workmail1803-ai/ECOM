-- ============================================================================
-- 0005  Marketing: coupons, flash sales, banners, delivery zones, settings
-- ============================================================================

-- ── Delivery zones ──────────────────────────────────────────────────────────
-- Fees are data, never constants in a component. `districts` lists the BD
-- districts that resolve to this zone; the fallback zone has is_fallback=true.
create table if not exists public.delivery_zones (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null,
  fee_paisa     integer not null,
  -- Order subtotal at or above which the fee is waived. Null = never free.
  free_above_paisa integer,
  min_days      integer not null default 1,
  max_days      integer not null default 3,
  districts     text[] not null default '{}',
  is_fallback   boolean not null default false,
  is_active     boolean not null default true,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint delivery_zones_fee_nonneg check (fee_paisa >= 0),
  constraint delivery_zones_days_sane check (min_days > 0 and max_days >= min_days),
  constraint delivery_zones_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create unique index if not exists delivery_zones_slug_key on public.delivery_zones (slug);
-- Exactly one fallback zone.
create unique index if not exists delivery_zones_one_fallback
  on public.delivery_zones ((is_fallback)) where is_fallback;

drop trigger if exists set_updated_at on public.delivery_zones;
create trigger set_updated_at before update on public.delivery_zones
  for each row execute function public.tg_set_updated_at();

-- ── Coupons ─────────────────────────────────────────────────────────────────
create table if not exists public.coupons (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null,
  description         text,
  discount_type       public.discount_type not null,
  -- percentage → basis of 1 = 1%; fixed → paisa
  discount_value      integer not null,
  min_order_paisa     integer not null default 0,
  max_discount_paisa  integer,
  starts_at           timestamptz,
  expires_at          timestamptz,
  usage_limit         integer,
  per_user_limit      integer not null default 1,
  used_count          integer not null default 0,
  -- Empty array = applies to everything.
  product_ids         uuid[] not null default '{}',
  category_ids        uuid[] not null default '{}',
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint coupons_value_positive check (discount_value > 0),
  constraint coupons_percentage_range check (
    discount_type <> 'percentage' or discount_value <= 100
  ),
  constraint coupons_window_sane check (
    starts_at is null or expires_at is null or expires_at > starts_at
  ),
  constraint coupons_limits_nonneg check (
    used_count >= 0
    and per_user_limit > 0
    and (usage_limit is null or usage_limit > 0)
  )
);
-- Lookup is always by uppercase code.
create unique index if not exists coupons_code_key on public.coupons (upper(code));
create index if not exists coupons_active_idx
  on public.coupons (expires_at) where is_active;

drop trigger if exists set_updated_at on public.coupons;
create trigger set_updated_at before update on public.coupons
  for each row execute function public.tg_set_updated_at();

create table if not exists public.coupon_usage (
  id         uuid primary key default gen_random_uuid(),
  coupon_id  uuid not null references public.coupons (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete set null,
  order_id   uuid,  -- FK added in 0006 once orders exists
  discount_paisa integer not null,
  created_at timestamptz not null default now()
);
create index if not exists coupon_usage_coupon_user_idx
  on public.coupon_usage (coupon_id, user_id);

-- ── Flash sales ─────────────────────────────────────────────────────────────
create table if not exists public.flash_sales (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  subtitle    text,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint flash_sales_window check (ends_at > starts_at)
);
-- The homepage asks "is there a live sale right now", ordered by end time.
create index if not exists flash_sales_live_idx
  on public.flash_sales (starts_at, ends_at) where is_active;

drop trigger if exists set_updated_at on public.flash_sales;
create trigger set_updated_at before update on public.flash_sales
  for each row execute function public.tg_set_updated_at();

create table if not exists public.flash_sale_items (
  id              uuid primary key default gen_random_uuid(),
  flash_sale_id   uuid not null references public.flash_sales (id) on delete cascade,
  product_id      uuid not null references public.products (id) on delete cascade,
  sale_price_paisa integer not null,
  -- Units released for the sale, and how many have gone. Drives the urgency bar.
  stock_limit     integer,
  sold_count      integer not null default 0,
  position        integer not null default 0,
  constraint flash_sale_items_price_positive check (sale_price_paisa > 0),
  constraint flash_sale_items_sold_nonneg check (sold_count >= 0)
);
create unique index if not exists flash_sale_items_unique
  on public.flash_sale_items (flash_sale_id, product_id);
create index if not exists flash_sale_items_sale_idx
  on public.flash_sale_items (flash_sale_id, position);
-- Reverse lookup: "is this product in a live sale" on the PDP.
create index if not exists flash_sale_items_product_idx
  on public.flash_sale_items (product_id);

-- ── Banners ─────────────────────────────────────────────────────────────────
create table if not exists public.banners (
  id            uuid primary key default gen_random_uuid(),
  placement     public.banner_placement not null default 'hero',
  title         text not null,
  subtitle      text,
  eyebrow       text,
  image_url     text,
  mobile_image_url text,
  cta_label     text,
  cta_href      text,
  secondary_cta_label text,
  secondary_cta_href  text,
  -- Optional accent used by the hero to tint its own gradient stops.
  accent_hex    text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  priority      integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint banners_window check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint banners_accent_hex check (accent_hex is null or accent_hex ~* '^#[0-9a-f]{6}$')
);
create index if not exists banners_placement_idx
  on public.banners (placement, priority desc) where is_active;

drop trigger if exists set_updated_at on public.banners;
create trigger set_updated_at before update on public.banners
  for each row execute function public.tg_set_updated_at();

-- ── Referrals ───────────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid not null references auth.users (id) on delete cascade,
  code          text not null,
  referred_user_id uuid references auth.users (id) on delete set null,
  reward_paisa  integer not null default 0,
  is_rewarded   boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index if not exists referrals_code_key on public.referrals (upper(code));
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

-- ── Settings (single-row key/value) ─────────────────────────────────────────
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

drop trigger if exists set_updated_at on public.settings;
create trigger set_updated_at before update on public.settings
  for each row execute function public.tg_set_updated_at();

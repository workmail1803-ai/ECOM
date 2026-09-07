-- ============================================================================
-- 0003  Catalog: categories, brands, products, variants, images, attributes
-- ============================================================================
-- Money is stored as integer paisa (1 BDT = 100 paisa). Never float. Display
-- formatting divides by 100 exactly once, in lib/utils/money.ts.

create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references public.categories (id) on delete set null,
  name         text not null,
  slug         text not null,
  description  text,
  image_url    text,
  icon         text,                      -- lucide icon name for nav rendering
  position     integer not null default 0,
  is_active    boolean not null default true,
  is_featured  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint categories_not_own_parent check (parent_id is null or parent_id <> id)
);

create unique index if not exists categories_slug_key on public.categories (slug);
-- Nav renders "active top-level, ordered". Partial + ordered index means the
-- planner reads the index in output order and skips the sort entirely.
create index if not exists categories_nav_idx
  on public.categories (parent_id, position)
  where is_active;

create table if not exists public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null,
  logo_url   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint brands_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create unique index if not exists brands_slug_key on public.brands (slug);

-- ── Products ────────────────────────────────────────────────────────────────
create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid references public.categories (id) on delete set null,
  brand_id            uuid references public.brands (id) on delete set null,
  name                text not null,
  slug                text not null,
  sku                 text not null,
  short_description   text,
  description         text,
  -- Free-form spec sheet: [{label, value}]. Rendered as a table on the PDP.
  specifications      jsonb not null default '[]'::jsonb,
  features            text[] not null default '{}',
  warranty            text,
  delivery_note       text,

  price_paisa         integer not null,
  compare_at_paisa    integer,
  -- Cost is staff-only. RLS keeps the whole row from anon writes, and the
  -- public read path selects explicit columns so this never leaves the server.
  cost_paisa          integer,

  stock               integer not null default 0,
  low_stock_threshold integer not null default 5,

  status              public.product_status not null default 'draft',
  is_featured         boolean not null default false,
  is_new_arrival      boolean not null default false,
  is_best_seller      boolean not null default false,

  thumbnail_url       text,
  video_url           text,

  -- Maintained by trigger; read by the review aggregate and sort-by-rating.
  rating_sum          integer not null default 0,
  rating_count        integer not null default 0,
  -- Maintained on order confirmation; drives Best Sellers without a join.
  units_sold          integer not null default 0,

  search_vector       tsvector,

  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint products_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint products_price_positive check (price_paisa > 0),
  constraint products_compare_at_sane check (
    compare_at_paisa is null or compare_at_paisa > price_paisa
  ),
  constraint products_cost_nonneg check (cost_paisa is null or cost_paisa >= 0),
  constraint products_stock_nonneg check (stock >= 0),
  constraint products_rating_consistent check (
    rating_count >= 0
    and rating_sum >= 0
    and rating_sum <= rating_count * 5
  )
);

create unique index if not exists products_slug_key on public.products (slug);
create unique index if not exists products_sku_key on public.products (upper(sku));

-- Access paths, deliberately few. Each index is ~8-16 KB per 1k rows and must
-- be held in shared_buffers to be useful, so we only add ones the app runs.
--
--  1. Category listing, newest first  → the most common storefront query.
create index if not exists products_category_published_idx
  on public.products (category_id, published_at desc)
  where status = 'active';
--  2. Global "all products" / New Arrivals feed.
create index if not exists products_active_published_idx
  on public.products (published_at desc)
  where status = 'active';
--  3. Sort by price (both directions use the same btree).
create index if not exists products_active_price_idx
  on public.products (price_paisa)
  where status = 'active';
--  4. Best sellers.
create index if not exists products_best_sellers_idx
  on public.products (units_sold desc)
  where status = 'active' and is_best_seller;
--  5. Featured rail.
create index if not exists products_featured_idx
  on public.products (published_at desc)
  where status = 'active' and is_featured;
--  6. Brand filter.
create index if not exists products_brand_idx
  on public.products (brand_id)
  where status = 'active' and brand_id is not null;
--  7. Admin low-stock report.
create index if not exists products_low_stock_idx
  on public.products (stock)
  where status <> 'archived';
--  8. Full-text search. ONE GIN index for the whole catalog. Deliberately not
--     using pg_trgm per-column indexes: three trigram indexes on a 5k-product
--     table cost more resident memory than the entire heap.
create index if not exists products_search_idx
  on public.products using gin (search_vector);

-- Weighted search vector. A=name, B=brand+category, C=sku, D=description.
-- Recomputed only when a contributing column actually changes.
create or replace function public.tg_products_search_vector()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  brand_name text;
  category_name text;
begin
  select b.name into brand_name from public.brands b where b.id = new.brand_id;
  select c.name into category_name from public.categories c where c.id = new.category_id;

  new.search_vector :=
      setweight(to_tsvector('simple', coalesce(new.name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(brand_name, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(category_name, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(new.sku, '')), 'C')
    || setweight(to_tsvector('simple', coalesce(new.short_description, '')), 'C')
    || setweight(to_tsvector('simple', array_to_string(new.features, ' ')), 'D')
    || setweight(to_tsvector('simple', left(coalesce(new.description, ''), 4000)), 'D');
  return new;
end;
$$;

drop trigger if exists products_search_vector on public.products;
create trigger products_search_vector
  before insert or update of name, sku, short_description, description, features, brand_id, category_id
  on public.products
  for each row execute function public.tg_products_search_vector();

drop trigger if exists set_updated_at on public.products;
create trigger set_updated_at before update on public.products
  for each row execute function public.tg_set_updated_at();

-- Publishing stamps published_at once, so "newest" is stable if a product is
-- later edited.
create or replace function public.tg_products_publish_stamp()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists products_publish_stamp on public.products;
create trigger products_publish_stamp before insert or update of status on public.products
  for each row execute function public.tg_products_publish_stamp();

-- ── Variants ────────────────────────────────────────────────────────────────
-- price_paisa null = inherit the parent product price. Avoids having to update
-- every variant when a base price changes.
create table if not exists public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  name          text not null,
  sku           text not null,
  price_paisa   integer,
  compare_at_paisa integer,
  stock         integer not null default 0,
  image_url     text,
  -- {"color":"Midnight Black","storage":"128GB"}
  attributes    jsonb not null default '{}'::jsonb,
  position      integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint variants_price_positive check (price_paisa is null or price_paisa > 0),
  constraint variants_stock_nonneg check (stock >= 0)
);

create unique index if not exists product_variants_sku_key
  on public.product_variants (upper(sku));
create index if not exists product_variants_product_idx
  on public.product_variants (product_id, position)
  where is_active;

drop trigger if exists set_updated_at on public.product_variants;
create trigger set_updated_at before update on public.product_variants
  for each row execute function public.tg_set_updated_at();

-- ── Images ──────────────────────────────────────────────────────────────────
create table if not exists public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url        text not null,
  alt        text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx
  on public.product_images (product_id, position);

-- ── Structured attributes (filterable facets) ───────────────────────────────
create table if not exists public.product_attributes (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name       text not null,
  value      text not null,
  created_at timestamptz not null default now()
);
create index if not exists product_attributes_product_idx
  on public.product_attributes (product_id);
create unique index if not exists product_attributes_unique
  on public.product_attributes (product_id, lower(name), lower(value));

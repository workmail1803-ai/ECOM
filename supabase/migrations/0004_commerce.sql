-- ============================================================================
-- 0004  Commerce: carts, wishlists, recently viewed
-- ============================================================================

-- A cart belongs to either a signed-in user or an anonymous token stored in a
-- httpOnly cookie. Exactly one of the two is set. On sign-in the guest cart is
-- merged into the user cart by merge_guest_cart().
create table if not exists public.carts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete cascade,
  guest_token  text,
  -- Applied coupon travels with the cart so the quote is reproducible.
  coupon_code  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint carts_owner_exactly_one check (
    (user_id is not null and guest_token is null)
    or (user_id is null and guest_token is not null)
  )
);

-- One active cart per owner. Partial unique indexes because each expression is
-- null for half the rows.
create unique index if not exists carts_user_key
  on public.carts (user_id) where user_id is not null;
create unique index if not exists carts_guest_key
  on public.carts (guest_token) where guest_token is not null;
-- Cleanup job for abandoned guest carts.
create index if not exists carts_guest_stale_idx
  on public.carts (updated_at) where user_id is null;

create table if not exists public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  quantity   integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_quantity_range check (quantity > 0 and quantity <= 99)
);

create index if not exists cart_items_cart_idx on public.cart_items (cart_id);
-- One row per (cart, product, variant). COALESCE on variant_id because NULLs
-- are distinct in a plain unique index, which would allow duplicate rows for
-- the no-variant case.
create unique index if not exists cart_items_unique_line
  on public.cart_items (cart_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists set_updated_at on public.carts;
create trigger set_updated_at before update on public.carts
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.cart_items;
create trigger set_updated_at before update on public.cart_items
  for each row execute function public.tg_set_updated_at();

-- Touch the parent cart whenever a line changes so abandoned-cart detection
-- and the cookie TTL both work off carts.updated_at.
create or replace function public.tg_touch_cart()
returns trigger
language plpgsql
as $$
begin
  update public.carts set updated_at = now()
  where id = coalesce(new.cart_id, old.cart_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_cart on public.cart_items;
create trigger touch_cart after insert or update or delete on public.cart_items
  for each row execute function public.tg_touch_cart();

-- ── Wishlist ────────────────────────────────────────────────────────────────
-- Single flat table. A separate `wishlists` header buys nothing when every user
-- has exactly one list, and it would cost a join on every heart icon render.
create table if not exists public.wishlist_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists wishlist_items_unique
  on public.wishlist_items (user_id, product_id);
create index if not exists wishlist_items_user_idx
  on public.wishlist_items (user_id, created_at desc);

-- ── Recently viewed ─────────────────────────────────────────────────────────
-- Capped at 20 rows per user by a trigger so this table cannot grow without
-- bound. Guest history is kept in localStorage instead — writing a DB row on
-- every anonymous page view is the single easiest way to blow the free tier.
create table if not exists public.recently_viewed (
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index if not exists recently_viewed_user_idx
  on public.recently_viewed (user_id, viewed_at desc);

create or replace function public.tg_cap_recently_viewed()
returns trigger
language plpgsql
as $$
begin
  delete from public.recently_viewed rv
  where rv.user_id = new.user_id
    and rv.product_id not in (
      select product_id from public.recently_viewed
      where user_id = new.user_id
      order by viewed_at desc
      limit 20
    );
  return null;
end;
$$;

drop trigger if exists cap_recently_viewed on public.recently_viewed;
create trigger cap_recently_viewed after insert on public.recently_viewed
  for each row execute function public.tg_cap_recently_viewed();

-- ── Newsletter ──────────────────────────────────────────────────────────────
create table if not exists public.newsletter_subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  source        text,
  is_active     boolean not null default true,
  unsubscribed_at timestamptz,
  created_at    timestamptz not null default now(),
  constraint newsletter_email_format check (email ~* '^[^@\s]+@[^@\s.]+\.[^@\s]+$')
);
create unique index if not exists newsletter_email_key
  on public.newsletter_subscribers (lower(email));

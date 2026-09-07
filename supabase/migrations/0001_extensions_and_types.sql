-- ============================================================================
-- 0001  Extensions, enums, shared helpers
-- ============================================================================
-- Everything in this project is written to be idempotent so the whole folder
-- can be replayed against an existing database without error.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ── Enums ───────────────────────────────────────────────────────────────────
-- Enums keep status columns to 4 bytes instead of a variable-width text and
-- give us database-level validation for free.

do $$ begin
  create type public.app_role as enum ('customer', 'manager', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum (
    'placed',
    'confirmed',
    'processing',
    'shipped',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'returned'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum (
    'initiated',
    'pending',
    'successful',
    'failed',
    'cancelled',
    'refunded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('cod', 'bkash', 'nagad', 'card', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.discount_type as enum ('percentage', 'fixed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.review_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.product_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.banner_placement as enum ('hero', 'promo_strip', 'category_tile', 'offer_card');
exception when duplicate_object then null; end $$;

-- ── Shared trigger: maintain updated_at ─────────────────────────────────────
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Slug helper ─────────────────────────────────────────────────────────────
-- Deterministic, ASCII-safe slugs. `unaccent` handles transliterable accents;
-- anything else is dropped. Used by seed data and admin create flows.
create or replace function public.slugify(input text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select trim(
           both '-' from
           regexp_replace(
             regexp_replace(lower(extensions.unaccent(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
             '-{2,}', '-', 'g'
           )
         );
$$;

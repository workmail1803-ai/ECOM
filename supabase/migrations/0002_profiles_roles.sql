-- ============================================================================
-- 0002  Identity: profiles, roles, addresses
-- ============================================================================
-- Roles live in their OWN table, not on `profiles`. If the role sat on a row
-- the user is allowed to update, a customer could `update profiles set
-- role='admin'`. Separating it means "can edit my name" and "can grant myself
-- admin" are different permissions, and only SECURITY DEFINER functions or the
-- service role can touch user_roles.

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  phone         text,
  avatar_url    text,
  -- Denormalised for admin search; kept in sync by the auth trigger below.
  email         text,
  marketing_opt_in boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_phone_bd_format check (
    phone is null or phone ~ '^01[3-9][0-9]{8}$'
  )
);

comment on column public.profiles.phone is
  'Bangladeshi mobile in local 11-digit form (01XXXXXXXXX). Normalised on write.';

create table if not exists public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Addresses: multiple per customer, one default.
create table if not exists public.addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  label         text,
  recipient_name text not null,
  phone         text not null,
  district      text not null,
  area          text not null,
  street        text not null,
  postcode      text,
  landmark      text,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint addresses_phone_bd_format check (phone ~ '^01[3-9][0-9]{8}$')
);

-- ── Indexes ────────────────────────────────────────────────────────────────
-- addresses: every read is "my addresses", so user_id is the only access path.
create index if not exists addresses_user_id_idx on public.addresses (user_id);

-- Exactly one default address per user, enforced by a partial unique index
-- rather than a trigger. Costs almost nothing because it only indexes the
-- handful of rows where is_default is true.
create unique index if not exists addresses_one_default_per_user
  on public.addresses (user_id)
  where is_default;

-- Admin customer search. Email is unique per auth user anyway.
create unique index if not exists profiles_email_key on public.profiles (lower(email))
  where email is not null;
create index if not exists profiles_phone_idx on public.profiles (phone) where phone is not null;

-- user_roles PK already covers (user_id, role). We also filter by role alone
-- when listing staff, which is a tiny table — no extra index needed.

-- ── Triggers ────────────────────────────────────────────────────────────────
drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.addresses;
create trigger set_updated_at before update on public.addresses
  for each row execute function public.tg_set_updated_at();

-- Normalise phone numbers on the way in: strip spaces/dashes and the +880 or
-- 880 country prefix so the CHECK constraint sees a canonical 01XXXXXXXXX.
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
  if length(digits) = 13 and left(digits, 3) = '880' then
    digits := substr(digits, 4);
  elsif length(digits) = 12 and left(digits, 2) = '88' then
    digits := substr(digits, 3);
  elsif length(digits) = 10 and left(digits, 1) = '1' then
    digits := '0' || digits;
  end if;
  new.phone := digits;
  return new;
end;
$$;

drop trigger if exists normalise_phone on public.profiles;
create trigger normalise_phone before insert or update of phone on public.profiles
  for each row execute function public.tg_normalise_phone();

drop trigger if exists normalise_phone on public.addresses;
create trigger normalise_phone before insert or update of phone on public.addresses
  for each row execute function public.tg_normalise_phone();

-- ── Auth → profile bridge ───────────────────────────────────────────────────
-- Runs as SECURITY DEFINER because auth.users triggers execute in the auth
-- context, which has no rights on public.
create or replace function public.tg_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '')
  )
  on conflict (id) do update
    set email = excluded.email;

  -- Every new account starts as a customer. Elevation is a deliberate,
  -- separately-audited action.
  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_on_auth_user_created();

-- Keep profiles.email in step with auth.users.email after a change/confirm.
create or replace function public.tg_on_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.tg_on_auth_user_updated();

-- ── Backfill for accounts created before this migration ─────────────────────
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'customer' from auth.users u
on conflict do nothing;

-- ============================================================================
-- 0019  Referrals, paid out as store credit
-- ============================================================================
-- Every account gets a share code. When somebody new signs up through it and
-- their first order is DELIVERED, both sides are credited.
--
-- Delivered, not placed: crediting on placement pays out on orders that are
-- later cancelled or refused at the door, which is the obvious way to farm a
-- referral scheme.
--
-- Credit is an append-only ledger, never a mutable balance column. A balance
-- that can be UPDATEd can be lost to a race or quietly edited; a ledger makes
-- every taka traceable to the row that created it.
--
-- Idempotent.

-- ── Codes ───────────────────────────────────────────────────────────────────
create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now(),
  constraint referral_codes_shape check (code ~ '^[A-Z0-9]{6,12}$')
);

-- ── Attribution ─────────────────────────────────────────────────────────────
-- `public.referrals` already exists: migration 0005 created it as dormant
-- schema that no application code ever used. It is reshaped here rather than
-- duplicated, because two referral tables is worse than one awkward one.
--
-- Its unique index on `upper(code)` has to go. With the code stored on the
-- referral row, that index allowed a referrer exactly ONE referral ever —
-- which is not a referral programme. Codes now live in referral_codes, one
-- per user, and this table records who was brought in by whom.
alter table public.referrals
  alter column code drop not null,
  add column if not exists status text not null default 'pending',
  add column if not exists credited_at timestamptz,
  add column if not exists qualifying_order uuid references public.orders (id) on delete set null;

drop index if exists public.referrals_code_key;

alter table public.referrals drop constraint if exists referrals_status;
alter table public.referrals
  add constraint referrals_status check (status in ('pending', 'credited', 'void'));

alter table public.referrals drop constraint if exists referrals_not_self;
alter table public.referrals
  add constraint referrals_not_self check (
    referred_user_id is null or referrer_id <> referred_user_id
  );

-- One referral per person, forever. Not partial: ON CONFLICT inference against
-- a partial index needs the predicate repeated at every call site, and this
-- table is empty, so the column can simply be required.
alter table public.referrals alter column referred_user_id set not null;

create unique index if not exists referrals_one_per_referred
  on public.referrals (referred_user_id);

create index if not exists referrals_referrer on public.referrals (referrer_id);

-- ── Credit ledger ───────────────────────────────────────────────────────────
create table if not exists public.credit_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Positive earns, negative spends. Balance is the sum, never a column.
  delta_paisa integer not null,
  reason      text not null,
  order_id    uuid references public.orders (id) on delete set null,
  referral_id uuid references public.referrals (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint credit_ledger_nonzero check (delta_paisa <> 0)
);

create index if not exists credit_ledger_user on public.credit_ledger (user_id, created_at desc);

-- One credit row per referral per side, so a retry cannot pay twice.
create unique index if not exists credit_ledger_referral_once
  on public.credit_ledger (referral_id, user_id)
  where referral_id is not null;

insert into public.settings (key, value, description, is_public) values
  ('referral_reward',
   '{"enabled": true, "referrer_paisa": 10000, "referred_paisa": 5000}'::jsonb,
   'Store credit in paisa awarded when a referred customer''s first order is delivered — to the referrer, and to the new customer.',
   true)
on conflict (key) do nothing;

-- ── Balance ─────────────────────────────────────────────────────────────────
create or replace function public.credit_balance(p_user uuid default null)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(delta_paisa), 0)::integer
    from public.credit_ledger
   where user_id = coalesce(p_user, (select auth.uid()));
$$;

-- ── Code issue / lookup ─────────────────────────────────────────────────────
create or replace function public.my_referral_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_code text;
  v_try integer := 0;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select code into v_code from public.referral_codes where user_id = v_user;
  if v_code is not null then
    return v_code;
  end if;

  -- Collisions are rare but not impossible; try a few times rather than
  -- handing the caller a unique-violation.
  loop
    v_try := v_try + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.referral_codes (user_id, code) values (v_user, v_code);
      return v_code;
    exception when unique_violation then
      if v_try >= 5 then raise; end if;
    end;
  end loop;
end;
$$;

-- ── Claim a code ────────────────────────────────────────────────────────────
-- Called right after sign-up. Silently does nothing when the code is unknown,
-- is the caller's own, or the caller was already referred — none of those are
-- errors worth showing a new customer mid sign-up.
create or replace function public.claim_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_referrer uuid;
begin
  if v_user is null or coalesce(trim(p_code), '') = '' then
    return false;
  end if;

  select user_id into v_referrer
    from public.referral_codes
   where code = upper(trim(p_code));

  if v_referrer is null or v_referrer = v_user then
    return false;
  end if;

  -- Only a NEW customer can be referred: someone who has already ordered was
  -- not brought in by this code.
  if exists (select 1 from public.orders where user_id = v_user) then
    return false;
  end if;

  insert into public.referrals (referrer_id, referred_user_id)
  values (v_referrer, v_user)
  on conflict (referred_user_id) do nothing;

  return found;
end;
$$;

-- ── Payout ──────────────────────────────────────────────────────────────────
-- Called when an order reaches 'delivered'. Safe to call repeatedly: the
-- partial unique index on credit_ledger makes a second payout a no-op.
create or replace function public.settle_referral_for_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_ref public.referrals;
  v_cfg jsonb;
begin
  select * into v_order from public.orders where id = p_order;
  if v_order.id is null or v_order.user_id is null or v_order.status <> 'delivered' then
    return;
  end if;

  select * into v_ref
    from public.referrals
   where referred_user_id = v_order.user_id and status = 'pending';
  if v_ref.id is null then
    return;
  end if;

  select value into v_cfg from public.settings where key = 'referral_reward';
  if not coalesce((v_cfg ->> 'enabled')::boolean, false) then
    return;
  end if;

  insert into public.credit_ledger (user_id, delta_paisa, reason, order_id, referral_id)
  values (
    v_ref.referrer_id,
    coalesce((v_cfg ->> 'referrer_paisa')::integer, 10000),
    'Referral reward', p_order, v_ref.id
  )
  on conflict do nothing;

  insert into public.credit_ledger (user_id, delta_paisa, reason, order_id, referral_id)
  values (
    v_ref.referred_user_id,
    coalesce((v_cfg ->> 'referred_paisa')::integer, 5000),
    'Welcome credit', p_order, v_ref.id
  )
  on conflict do nothing;

  update public.referrals
     set status = 'credited', credited_at = now(), qualifying_order = p_order
   where id = v_ref.id;
end;
$$;

-- Fire the payout the moment an order is marked delivered, rather than relying
-- on every code path that sets the status to remember to call it.
create or replace function public.tg_referral_on_delivered()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- `is distinct from` rather than coalesce(old.status, ''): status is an
  -- enum, and '' is not a member of it, so the coalesce raised 22P02 on every
  -- update instead of comparing anything.
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    perform public.settle_referral_for_order(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists referral_on_delivered on public.orders;
create trigger referral_on_delivered
  after update of status on public.orders
  for each row execute function public.tg_referral_on_delivered();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.referral_codes enable row level security;
alter table public.referrals      enable row level security;
alter table public.credit_ledger  enable row level security;

drop policy if exists referral_codes_own on public.referral_codes;
create policy referral_codes_own on public.referral_codes
  for select using (user_id = (select auth.uid()) or public.is_staff());

drop policy if exists referrals_own on public.referrals;
create policy referrals_own on public.referrals
  for select using (
    referrer_id = (select auth.uid())
    or referred_user_id = (select auth.uid())
    or public.is_staff()
  );

-- Read-only to customers. Every write goes through a SECURITY DEFINER
-- function, because a customer who can INSERT here can print money.
drop policy if exists credit_ledger_own on public.credit_ledger;
create policy credit_ledger_own on public.credit_ledger
  for select using (user_id = (select auth.uid()) or public.is_staff());

grant execute on function public.credit_balance(uuid) to authenticated;
grant execute on function public.my_referral_code() to authenticated;
grant execute on function public.claim_referral(text) to authenticated;
revoke all on function public.settle_referral_for_order(uuid) from anon, authenticated;

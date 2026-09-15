-- ============================================================================
-- 0025  Hold guest points against the phone number
-- ============================================================================
-- The product page and cart promised "Earn N points", and a guest checkout
-- earned nothing at all — award_points_for_order returned early when the order
-- had no user_id. The shop was advertising a reward it then did not give.
--
-- Deleting the promise would have been the small fix. It is the wrong one
-- here: most orders in this shop are cash on delivery from someone who never
-- makes an account, so "points, unless you are the majority of our customers"
-- is not a loyalty scheme.
--
-- Points for a guest are held against the NORMALISED PHONE — the same key
-- credit accounts use, and the thing a Bangladeshi shop actually knows a
-- customer by — and move to the real ledger the moment somebody signs in with
-- that number.
--
-- The phone is not proof of identity on its own. That is why holding is safe
-- but claiming is gated: points move only when Supabase Auth has authenticated
-- a session AND that account's profile carries the number. Someone who types a
-- stranger's phone at checkout hands them the points; they cannot take them.
--
-- Idempotent.

create table if not exists public.pending_points (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  points     integer not null,
  -- One row per order, so a replayed delivery cannot hold points twice.
  order_id   uuid not null unique references public.orders (id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null,

  constraint pending_points_positive check (points > 0),
  constraint pending_points_phone_shape check (phone ~ '^01[3-9][0-9]{8}$')
);

create index if not exists pending_points_phone
  on public.pending_points (phone)
  where claimed_at is null;

alter table public.pending_points enable row level security;

-- No customer-facing read. A phone is guessable, and letting anyone query
-- "what is waiting on 01712345678" leaks what strangers have been buying.
-- Claiming happens through the SECURITY DEFINER function below.
drop policy if exists pending_points_staff on public.pending_points;
create policy pending_points_staff on public.pending_points
  for all using (public.is_staff()) with check (public.is_staff());

-- ── Award: to the ledger if there is an account, to the holding table if not ─
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

  if v_order.id is null or v_order.status <> 'delivered' then
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

  if v_order.user_id is not null then
    insert into public.points_ledger (user_id, delta_points, reason, order_id)
    values (v_order.user_id, v_points, 'Earned on order ' || v_order.order_number, p_order)
    on conflict do nothing;
  else
    -- Guest. Hold it against the number the order was placed with.
    insert into public.pending_points (phone, points, order_id)
    values (v_order.customer_phone, v_points, p_order)
    on conflict (order_id) do nothing;
  end if;

  return v_points;
end;
$$;

-- ── Claim ───────────────────────────────────────────────────────────────────
-- Moves everything held against the caller's own verified profile number into
-- their ledger. Safe to call on every sign-in: claimed rows are skipped, and
-- the whole thing is one statement per row under a lock on the phone.
create or replace function public.claim_pending_points()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_phone text;
  v_row record;
  v_total integer := 0;
begin
  if v_user is null then
    return 0;
  end if;

  -- The caller's OWN number, read from their profile — never a phone passed
  -- in by the client, which would let anyone claim anyone's points.
  select public.normalise_bd_phone(phone) into v_phone
    from public.profiles where id = v_user;

  if v_phone is null or v_phone !~ '^01[3-9][0-9]{8}$' then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pending:' || v_phone, 0));

  for v_row in
    select * from public.pending_points
     where phone = v_phone and claimed_at is null
     for update
  loop
    insert into public.points_ledger (user_id, delta_points, reason, order_id)
    values (
      v_user,
      v_row.points,
      'Earned on an earlier order',
      v_row.order_id
    )
    on conflict do nothing;

    update public.pending_points
       set claimed_at = now(), claimed_by = v_user
     where id = v_row.id;

    v_total := v_total + v_row.points;
  end loop;

  return v_total;
end;
$$;

-- Claim automatically when a profile gains or changes its phone, which covers
-- sign-up: the trigger in 0002 writes the number from the sign-up form, and
-- anything already waiting on it lands immediately.
create or replace function public.tg_claim_points_on_profile_phone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := public.normalise_bd_phone(new.phone);
begin
  if v_phone is null or v_phone !~ '^01[3-9][0-9]{8}$' then
    return new;
  end if;

  update public.pending_points p
     set claimed_at = now(), claimed_by = new.id
   where p.phone = v_phone and p.claimed_at is null;

  insert into public.points_ledger (user_id, delta_points, reason, order_id)
  select new.id, p.points, 'Earned on an earlier order', p.order_id
    from public.pending_points p
   where p.phone = v_phone and p.claimed_by = new.id
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists claim_points_on_profile_phone on public.profiles;
create trigger claim_points_on_profile_phone
  after insert or update of phone on public.profiles
  for each row execute function public.tg_claim_points_on_profile_phone();

grant execute on function public.claim_pending_points() to authenticated;
revoke all on function public.award_points_for_order(uuid) from anon, authenticated;

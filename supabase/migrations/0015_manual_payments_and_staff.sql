-- ============================================================================
-- 0015  Manual bKash/Nagad verification + granular staff permissions
-- ============================================================================
-- Two features that both hinge on the same idea: a human decides, and the
-- database records who decided and when.
--
--  1. Manual payment verification. The customer sends money themselves from
--     their own bKash/Nagad app, then submits the transaction id and a
--     screenshot. Staff look at both and approve or reject. No gateway is
--     involved, so the ONLY thing that marks an order paid is a staff action,
--     recorded against a named account.
--
--  2. Staff permissions. `admin` keeps everything. `manager` now gets only the
--     sections an admin has explicitly granted, instead of all-or-nothing.

-- ── 1. Manual payment submissions ───────────────────────────────────────────
-- These live on `payments` rather than a side table: a manual submission IS a
-- payment attempt, and keeping it on the same row means the reconciliation
-- queries, the order page and settle_payment() all keep working unchanged.

alter table public.payments
  add column if not exists is_manual        boolean not null default false,
  -- The number the customer paid FROM. Support's first question on a dispute.
  add column if not exists sender_msisdn    text,
  -- Object path inside the PRIVATE `payment-proofs` bucket. Never a public URL:
  -- a payment screenshot shows a wallet balance and a phone number.
  add column if not exists screenshot_path  text,
  add column if not exists submitted_at     timestamptz,
  add column if not exists verified_by      uuid references auth.users (id) on delete set null,
  add column if not exists verified_at      timestamptz,
  add column if not exists rejection_reason text;

comment on column public.payments.is_manual is
  'Customer sent money themselves and submitted proof; settled by a staff decision, not a gateway callback.';

-- The moderation queue: manual payments still waiting on a human.
create index if not exists payments_manual_pending_idx
  on public.payments (submitted_at)
  where is_manual and status in ('initiated', 'pending');

-- A transaction id must not be reusable across orders — that is the single
-- most obvious way to try to pay once and claim twice.
create unique index if not exists payments_manual_txn_key
  on public.payments (provider, upper(provider_txn_id))
  where is_manual and provider_txn_id is not null;

-- ── Manual payment settings ─────────────────────────────────────────────────
-- The numbers customers send money to. Editable at /admin/settings, because a
-- merchant changes these more often than anyone expects.
insert into public.settings (key, value, description, is_public) values
  ('bkash_receive_number', '"01812345678"'::jsonb,
   'bKash personal/merchant number customers send money to', true),
  ('bkash_account_type', '"Personal"'::jsonb,
   'Shown next to the bKash number: Personal, Agent or Merchant', true),
  ('nagad_receive_number', '"01812345678"'::jsonb,
   'Nagad number customers send money to', true),
  ('nagad_account_type', '"Personal"'::jsonb,
   'Shown next to the Nagad number', true),
  ('manual_payment_note',
   '"Send the exact total, then enter the transaction ID you receive by SMS and attach a screenshot. We verify within a few hours during business hours."'::jsonb,
   'Instruction text on the payment submission page', true)
on conflict (key) do nothing;

-- ── Private bucket for the screenshots ──────────────────────────────────────
-- Private, unlike every other bucket in this project. Staff view them through
-- short-lived signed URLs generated server-side.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  execute 'drop policy if exists bidyut_proof_staff_read on storage.objects';
  execute 'drop policy if exists proof_staff_read on storage.objects';
end $$;

-- Staff may read proofs. Nobody may write from the client at all — uploads go
-- through a server action using the service role, AFTER it has verified the
-- submitter actually owns the order. That keeps anonymous guests from being
-- able to write into storage just because guest checkout exists.
create policy proof_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_staff());

-- ── submit_payment_proof ────────────────────────────────────────────────────
-- Identified by order number + phone, exactly like track_order(), so a guest
-- who checked out without an account can still submit. The phone is the second
-- factor: order numbers come from a sequence and are guessable on their own.
create or replace function public.submit_payment_proof(
  p_order_number   text,
  p_phone          text,
  p_txn_id         text,
  p_sender_msisdn  text,
  p_screenshot_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order   public.orders;
  v_payment public.payments;
  v_phone   text := public.normalise_bd_phone(p_phone);
  v_sender  text := public.normalise_bd_phone(p_sender_msisdn);
  v_txn     text := upper(trim(coalesce(p_txn_id, '')));
begin
  if v_txn = '' then
    raise exception 'txn_required' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders
  where upper(order_number) = upper(trim(coalesce(p_order_number, '')))
    and customer_phone = v_phone;

  -- Deliberately the same failure for "no such order" and "wrong phone".
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status in ('cancelled', 'returned') then
    raise exception 'order_closed' using errcode = 'P0001';
  end if;

  select * into v_payment from public.payments
  where order_id = v_order.id
  order by created_at desc
  limit 1;

  if v_payment.id is null then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  if v_payment.status = 'successful' then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;

  if v_payment.provider not in ('bkash', 'nagad') then
    raise exception 'not_a_manual_method' using errcode = 'P0001';
  end if;

  update public.payments
     set is_manual        = true,
         provider_txn_id  = v_txn,
         sender_msisdn    = nullif(v_sender, ''),
         screenshot_path  = coalesce(p_screenshot_path, screenshot_path),
         submitted_at     = now(),
         status           = 'pending',
         -- Re-submitting after a rejection clears the previous verdict.
         rejection_reason = null,
         verified_by      = null,
         verified_at      = null
   where id = v_payment.id;

  insert into public.payment_transactions (payment_id, event, status, amount_paisa, payload)
  values (v_payment.id, 'manual_submit', 'pending', v_payment.amount_paisa,
          jsonb_build_object('txn_id', v_txn, 'sender', v_sender));

  update public.orders set payment_status = 'pending' where id = v_order.id;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'order_number', v_order.order_number,
    'status', 'pending'
  );
exception
  -- A duplicate transaction id is a business answer, not a 500.
  when unique_violation then
    raise exception 'txn_already_used' using errcode = 'P0001';
end;
$$;

grant execute on function public.submit_payment_proof(text, text, text, text, text)
  to anon, authenticated;

-- ── verify_manual_payment ───────────────────────────────────────────────────
-- The staff decision. Approving settles the payment and confirms the order;
-- rejecting leaves the order alive so the customer can re-submit.
create or replace function public.verify_manual_payment(
  p_payment_id uuid,
  p_approve    boolean,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments;
  v_order   public.orders;
  v_actor   uuid := (select auth.uid());
begin
  if not public.has_permission('payments') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if not v_payment.is_manual then
    raise exception 'not_a_manual_payment' using errcode = 'P0001';
  end if;
  if v_payment.status = 'successful' then
    return jsonb_build_object('status', 'successful', 'changed', false);
  end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;

  if p_approve then
    update public.payments
       set status      = 'successful',
           settled_at  = now(),
           verified_by = v_actor,
           verified_at = now(),
           rejection_reason = null
     where id = p_payment_id;

    update public.orders set payment_status = 'successful' where id = v_order.id;

    -- A verified payment confirms the order, mirroring settle_payment().
    if v_order.status = 'placed' then
      update public.orders
         set status = 'confirmed', confirmed_at = now()
       where id = v_order.id;
      insert into public.order_status_history (order_id, status, note, changed_by)
      values (v_order.id, 'confirmed', 'Payment verified', v_actor);
    end if;
  else
    update public.payments
       set status           = 'failed',
           verified_by      = v_actor,
           verified_at      = now(),
           rejection_reason = coalesce(nullif(trim(p_reason), ''), 'Could not verify this payment')
     where id = p_payment_id;

    -- The order is NOT cancelled: the customer may have mistyped the
    -- transaction id and should get another go.
    update public.orders set payment_status = 'failed' where id = v_order.id;
  end if;

  insert into public.payment_transactions (payment_id, event, status, amount_paisa, payload)
  values (p_payment_id,
          case when p_approve then 'manual_approve' else 'manual_reject' end,
          case when p_approve then 'successful' else 'failed' end,
          v_payment.amount_paisa,
          jsonb_build_object('actor', v_actor, 'reason', p_reason));

  perform public.log_audit(
    case when p_approve then 'payment.verify' else 'payment.reject' end,
    'payment', p_payment_id::text,
    jsonb_build_object('order', v_order.order_number, 'txn', v_payment.provider_txn_id)
  );

  return jsonb_build_object(
    'status', case when p_approve then 'successful' else 'failed' end,
    'changed', true
  );
end;
$$;

grant execute on function public.verify_manual_payment(uuid, boolean, text) to authenticated;

-- ── 2. Staff permissions ────────────────────────────────────────────────────
-- `admin` implicitly holds every permission and cannot be restricted — someone
-- has to be able to fix a lockout. `manager` holds only what is granted here.

create table if not exists public.staff_permissions (
  user_id    uuid not null references auth.users (id) on delete cascade,
  permission text not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, permission),
  constraint staff_permissions_known_key check (permission in (
    'products', 'categories', 'stock',
    'orders', 'payments', 'customers',
    'coupons', 'banners', 'reviews',
    'reports'
  ))
);

comment on table public.staff_permissions is
  'Per-manager section grants. Admins are unrestricted and have no rows here.';

create index if not exists staff_permissions_user_idx
  on public.staff_permissions (user_id);

alter table public.staff_permissions enable row level security;

do $$ begin
  execute 'drop policy if exists staff_permissions_read on public.staff_permissions';
  execute 'drop policy if exists staff_permissions_admin_write on public.staff_permissions';
end $$;

-- You can see your own grants; an admin can see everyone's.
create policy staff_permissions_read on public.staff_permissions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy staff_permissions_admin_write on public.staff_permissions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── has_permission ──────────────────────────────────────────────────────────
-- SECURITY DEFINER + STABLE, like the other authz helpers, so policies can call
-- it without recursing and the planner evaluates it once per statement.
create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- Admins are unrestricted.
    exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
    or (
      -- Managers need the explicit grant.
      exists (
        select 1 from public.user_roles
        where user_id = (select auth.uid()) and role = 'manager'
      )
      and exists (
        select 1 from public.staff_permissions
        where user_id = (select auth.uid()) and permission = p_key
      )
    );
$$;

grant execute on function public.has_permission(text) to authenticated;

/** Every permission the caller holds. One round trip for the whole admin nav. */
create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
    then array[
      'products','categories','stock','orders','payments',
      'customers','coupons','banners','reviews','reports','settings','staff'
    ]
    else coalesce(
      (select array_agg(permission)
         from public.staff_permissions
        where user_id = (select auth.uid())),
      '{}'::text[]
    )
  end;
$$;

grant execute on function public.my_permissions() to authenticated;

-- ── set_staff_role ──────────────────────────────────────────────────────────
-- Creating staff and setting their grants in one transaction, so a manager can
-- never exist for a moment with no permissions and no audit trail.
create or replace function public.set_staff_access(
  p_user_id     uuid,
  p_role        public.app_role,
  p_permissions text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_perm  text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Locking yourself out is the one mistake with no in-app recovery.
  if p_user_id = v_actor then
    raise exception 'cannot_change_own_access' using errcode = 'P0001';
  end if;

  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role, granted_by)
  values (p_user_id, p_role, v_actor);

  delete from public.staff_permissions where user_id = p_user_id;

  -- Only managers carry grants: admins are unrestricted, customers have no
  -- admin surface at all.
  if p_role = 'manager' and p_permissions is not null then
    foreach v_perm in array p_permissions loop
      insert into public.staff_permissions (user_id, permission, granted_by)
      values (p_user_id, v_perm, v_actor)
      on conflict do nothing;
    end loop;
  end if;

  perform public.log_audit(
    'staff.access_change', 'user', p_user_id::text,
    jsonb_build_object('role', p_role, 'permissions', p_permissions)
  );

  return jsonb_build_object('role', p_role, 'permissions', coalesce(p_permissions, '{}'));
end;
$$;

grant execute on function public.set_staff_access(uuid, public.app_role, text[]) to authenticated;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Existing managers had implicit full access. Preserve it rather than silently
-- locking them out of sections they were using yesterday.
insert into public.staff_permissions (user_id, permission)
select ur.user_id, p.permission
from public.user_roles ur
cross join (
  values ('products'),('categories'),('stock'),('orders'),('payments'),
         ('customers'),('coupons'),('banners'),('reviews'),('reports')
) as p(permission)
where ur.role = 'manager'
on conflict do nothing;

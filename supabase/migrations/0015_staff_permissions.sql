-- ============================================================================
-- 0015  Granular staff permissions
-- ============================================================================
-- `admin` keeps everything. `manager` now gets only the sections an admin has
-- explicitly granted, instead of all-or-nothing.
--
-- Manual bKash/Nagad verification deliberately needs NO schema change and is
-- not in this file. It runs on columns 0006 already provides:
--
--   * the transaction id lives in `payments.provider_txn_id`;
--   * `payments.idempotency_key` carries the marker `manual:<provider>:<TXN>`,
--     and its existing UNIQUE index is what stops one transaction id being
--     claimed against two orders — the exact guarantee the feature needs;
--   * the sender's number, the screenshot path and who approved it live in
--     `payment_transactions.payload`, which is jsonb for precisely this;
--   * the rejection reason is `payments.failure_reason`.
--
-- Adding an `is_manual` boolean and a second unique index would have duplicated
-- a constraint the schema already had.

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

-- Every permission the caller holds. One round trip for the whole admin nav.
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

-- ── set_staff_access ────────────────────────────────────────────────────────
-- Role and grants in one transaction, so a manager can never exist for a moment
-- with no permissions and no audit trail.
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

-- ============================================================================
-- 0007  Authorization helpers
-- ============================================================================
-- These are SECURITY DEFINER + STABLE so RLS policies can call them without
-- recursing into the policies on user_roles itself, and so the planner caches
-- the result for the whole statement instead of re-running it per row.

create or replace function public.has_role(p_user_id uuid, p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = p_role
  );
$$;

-- "Staff" = anyone who may open /admin. Managers get everything except
-- role management, settings and destructive deletes (enforced per-policy).
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid())
      and role in ('admin', 'manager')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Read the caller's highest role. Used by the app to pick a nav variant; the
-- actual permission checks always go through is_staff()/is_admin().
create or replace function public.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.user_roles
  where user_id = (select auth.uid())
  order by case role when 'admin' then 3 when 'manager' then 2 else 1 end desc
  limit 1;
$$;

revoke all on function public.has_role(uuid, public.app_role) from anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_role() to authenticated;

-- ── Audit helper ────────────────────────────────────────────────────────────
create or replace function public.log_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_changes jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, changes)
  values ((select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_changes, '{}'::jsonb));
$$;

grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;

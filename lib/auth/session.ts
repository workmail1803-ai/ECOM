import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/types/database";
import {
  ADMIN_PERMISSIONS,
  ALL_PERMISSIONS,
  type AdminPermission,
} from "./permissions";

export type { AdminPermission } from "./permissions";
export { ADMIN_PERMISSIONS, PERMISSION_LABELS } from "./permissions";

export interface SessionUser {
  id: string;
  email: string | null;
  role: AppRole;
  profile: Profile | null;
  /** Admin sections this account may open. Admins hold every key. */
  permissions: AdminPermission[];
}


/**
 * The signed-in user plus their role, or null.
 *
 * Wrapped in React `cache` so a page that checks auth in the layout, the page
 * and two components still costs one round trip per request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // my_role() is SECURITY DEFINER over user_roles, so a client cannot spoof it
  // the way it could a JWT claim.
  const [{ data: role }, { data: profile }, perms] = await Promise.all([
    supabase.rpc("my_role"),
    supabase
      .from("profiles")
      .select(
        "id, full_name, phone, avatar_url, email, marketing_opt_in, created_at, updated_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("my_permissions"),
  ]);

  const resolvedRole = (role as AppRole | null) ?? "customer";

  return {
    id: user.id,
    email: user.email ?? null,
    role: resolvedRole,
    profile: (profile as unknown as Profile | null) ?? null,
    permissions: resolvePermissions(resolvedRole, perms),
  };
});

/**
 * Turn the my_permissions() result into a permission list.
 *
 * The fallback matters: my_permissions() only exists once migration 0015 has
 * been applied. Until then the RPC errors and `data` is null, and we fall back
 * to the pre-0015 behaviour where any staff member had every section. Without
 * this the admin panel would go dark between deploying the code and running
 * the migration.
 */
function resolvePermissions(
  role: AppRole,
  result: { data: unknown; error: unknown } | unknown,
): AdminPermission[] {
  const data =
    result && typeof result === "object" && "data" in result
      ? (result as { data: unknown }).data
      : result;

  if (Array.isArray(data)) {
    return data.filter((p): p is AdminPermission =>
      ALL_PERMISSIONS.includes(p as AdminPermission),
    );
  }

  if (role === "admin") return ALL_PERMISSIONS;
  // Pre-migration manager: previously unrestricted apart from settings/staff.
  if (role === "manager") return [...ADMIN_PERMISSIONS];
  return [];
}

/** For pages that must have a user. Redirects rather than throwing. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  }
  return user;
}

/**
 * For /admin pages and every admin server action.
 *
 * Middleware already redirects non-staff away from /admin, but middleware is
 * UX. This is the check that actually gates a mutation, and it must be called
 * at the top of any action that uses the service-role client.
 */
export async function requireStaff(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (user.role !== "admin" && user.role !== "manager") redirect("/");
  return user;
}

/** Full admins only — role management, settings, destructive deletes. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (user.role !== "admin") redirect("/admin");
  return user;
}

export function isStaffRole(role: AppRole | null | undefined): boolean {
  return role === "admin" || role === "manager";
}

/** Does this session hold a given admin section? Admins always do. */
export function can(
  user: SessionUser | null,
  permission: AdminPermission,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.permissions.includes(permission);
}

/**
 * Gate an admin page or action on one section.
 *
 * This is the check that actually matters for actions using the service-role
 * client. The SQL side re-checks via has_permission(), so a forged request
 * fails there too.
 */
export async function requirePermission(
  permission: AdminPermission,
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (!isStaffRole(user.role)) redirect("/");
  // Settings and staff are admin-only and cannot be delegated.
  if ((permission === "settings" || permission === "staff") && user.role !== "admin") {
    redirect("/admin");
  }
  if (!can(user, permission)) redirect("/admin");
  return user;
}

import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/types/database";

export interface SessionUser {
  id: string;
  email: string | null;
  role: AppRole;
  profile: Profile | null;
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
  const [{ data: role }, { data: profile }] = await Promise.all([
    supabase.rpc("my_role"),
    supabase
      .from("profiles")
      .select(
        "id, full_name, phone, avatar_url, email, marketing_opt_in, created_at, updated_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  return {
    id: user.id,
    email: user.email ?? null,
    role: (role as AppRole | null) ?? "customer",
    profile: (profile as unknown as Profile | null) ?? null,
  };
});

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

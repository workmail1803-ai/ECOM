"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Anon key only — it is safe to ship because RLS,
 * not key secrecy, is the security boundary.
 *
 * Used for auth transitions (sign in/out, password reset) and realtime-free
 * reads. Mutations that touch money or stock go through server actions.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

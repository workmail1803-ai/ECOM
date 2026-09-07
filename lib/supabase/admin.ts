import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Legitimate uses, and only these:
 *   - payment webhooks calling settle_payment(), which is revoked from both
 *     client roles
 *   - admin reads of columns revoked at the column level (products.cost_paisa)
 *   - the seed/maintenance scripts
 *
 * Any call site MUST have already established that the caller is staff via
 * `requireStaff()`. This client will happily read every row in the database,
 * so an unguarded call is a data breach, not a bug.
 *
 * `server-only` makes importing this from a client component a build error.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Admin and webhook paths cannot run.",
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

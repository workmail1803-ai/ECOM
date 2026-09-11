import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Request-scoped Supabase client that carries the user's session.
 *
 * Every query made through this client runs as the signed-in user (or `anon`),
 * so RLS is the thing deciding what comes back. Never widen a permission by
 * reaching for the service-role client — fix the policy instead.
 *
 * Wrapped in React `cache`, which is load-bearing rather than an optimisation.
 * A single page render calls this from several places — the header's cart
 * quote, the session lookup, a page query — and each client keeps its own auth
 * state. Without the cache, an expired access token means several of them try
 * to refresh at once; Supabase ROTATES refresh tokens, so the first refresh
 * wins and the rest fail with `refresh_token_already_used`, which silently
 * signs the user out mid-request. One client per request means one refresh.
 *
 * `cookies()` is async in Next 15+, so this function is too.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where the cookie jar is
            // read-only. Middleware refreshes the session on every request, so
            // dropping the write here is safe.
          }
        },
      },
    },
  );
});

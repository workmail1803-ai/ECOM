import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Guest cart identity.
 *
 * A signed-out shopper is identified by a random token in an httpOnly cookie.
 * RLS cannot see that token (it is not a JWT claim), which is exactly why the
 * cart RPCs in migration 0009 are SECURITY DEFINER and take the token as an
 * argument — they do the ownership check the policies cannot.
 *
 * The cart UUID is never sent to the browser. Every request resolves it from
 * the cookie server-side, so a guessed cart id buys an attacker nothing.
 */

export const GUEST_TOKEN_COOKIE = "bidyut_gt";
const GUEST_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** 32 hex chars. The RPC rejects anything shorter than 16. */
function newGuestToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Read the guest token without creating one. Safe in a Server Component. */
export async function readGuestToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(GUEST_TOKEN_COOKIE)?.value ?? null;
}

/**
 * Read or mint the guest token.
 *
 * Only callable from a server action or route handler — a Server Component
 * cannot write cookies, and this needs to.
 */
export async function ensureGuestToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_TOKEN_COOKIE)?.value;
  if (existing && existing.length >= 16) return existing;

  const token = newGuestToken();
  store.set(GUEST_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_TOKEN_MAX_AGE,
  });
  return token;
}

export async function clearGuestToken(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_TOKEN_COOKIE);
}

/**
 * The current cart id, creating one if needed.
 *
 * Signed in  → the user's cart (guest token ignored by the RPC).
 * Signed out → the cart for the cookie token, minting a token if absent.
 *
 * Mutating variant: writes a cookie, so call it only from actions/routes.
 */
export async function getOrCreateCartId(): Promise<{
  cartId: string;
  guestToken: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data, error } = await supabase.rpc("get_or_create_cart", {
      p_guest_token: null,
    });
    if (error) throw error;
    return { cartId: data as string, guestToken: null };
  }

  const guestToken = await ensureGuestToken();
  const { data, error } = await supabase.rpc("get_or_create_cart", {
    p_guest_token: guestToken,
  });
  if (error) throw error;
  return { cartId: data as string, guestToken };
}

/**
 * Read-only variant for Server Components.
 *
 * Returns null instead of creating a cart, so merely rendering the header does
 * not write a row for every crawler that hits the homepage.
 */
export async function getExistingCartId(): Promise<{
  cartId: string | null;
  guestToken: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data } = await supabase
      .from("carts")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    return { cartId: data?.id ?? null, guestToken: null };
  }

  const guestToken = await readGuestToken();
  if (!guestToken) return { cartId: null, guestToken: null };

  // RLS hides guest carts from the anon role by design, so the SELECT on the
  // carts table always returns nothing for guests. Skip it and go straight to
  // the SECURITY DEFINER RPC which does the token-based ownership check.
  const { data: rpcId } = await supabase.rpc("get_or_create_cart", {
    p_guest_token: guestToken,
  });
  return { cartId: (rpcId as string | null) ?? null, guestToken };
}

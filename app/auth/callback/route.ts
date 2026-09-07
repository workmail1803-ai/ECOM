import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readGuestToken, clearGuestToken } from "@/lib/cart/session";

/**
 * Email-confirmation and OAuth landing route.
 *
 * Exchanges the `code` for a session, then folds any guest cart into the new
 * user's cart — the same merge sign-in does, because confirming an email is
 * also a sign-in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/account";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=invalid_code`);
  }

  const guestToken = await readGuestToken();
  if (guestToken) {
    await supabase.rpc("merge_guest_cart", { p_guest_token: guestToken });
    await clearGuestToken();
  }

  return NextResponse.redirect(`${origin}${next}`);
}

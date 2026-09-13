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
  // Only ever an in-app path: an open redirect here would let a crafted email
  // bounce a freshly-authenticated visitor to someone else's site.
  const raw = searchParams.get("next") ?? "/account";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account";

  // Supabase appends its own error when a link is expired or already consumed.
  const supabaseError = searchParams.get("error_description") ?? searchParams.get("error");
  if (supabaseError) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(supabaseError)}`,
    );
  }

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

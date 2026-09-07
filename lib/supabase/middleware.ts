import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase auth cookie on every request and applies the
 * storefront's redirect rules.
 *
 * These redirects are UX, not authorization. A user who edits the URL to reach
 * /admin still gets nothing back, because every admin query is filtered by RLS
 * and `is_staff()`. Do not treat this file as a security boundary.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the JWT against the auth server. getSession() would
  // trust whatever is in the cookie, which is exactly what we cannot do here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  const isAccountRoute = pathname.startsWith("/account");
  const isAuthRoute = pathname === "/sign-in" || pathname === "/sign-up";

  if (!user && (isAdminRoute || isAccountRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in users have no business on the sign-in page.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.searchParams.get("next") ?? "/account";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Staff check for /admin. One RPC, and only on admin routes, so the common
  // storefront request does not pay for it.
  if (user && isAdminRoute) {
    const { data: isStaff } = await supabase.rpc("is_staff");
    if (!isStaff) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

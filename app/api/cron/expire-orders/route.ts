import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cancel prepaid orders that were never paid inside the window.
 *
 * Run by Vercel Cron (see vercel.json). The work itself is one SQL function,
 * `expire_unpaid_orders()`, which releases stock and writes order history
 * exactly as a human cancellation would — this route only decides who is
 * allowed to trigger it.
 *
 * Authorisation is required and has no dev-mode bypass. An open endpoint here
 * would let anyone cancel every unpaid order in the shop.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Failing closed is the only safe default: without a secret there is no
    // way to tell Vercel's scheduler apart from a stranger with the URL.
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc("expire_unpaid_orders");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cancelled: Number(data ?? 0) });
}

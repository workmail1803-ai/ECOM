"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CreditAccountCheck {
  found: boolean;
  holderName?: string | null;
  limitPaisa?: number;
  outstandingPaisa?: number;
  availablePaisa?: number;
}

/**
 * Look up a credit account by phone, for the checkout "Check Credit" button.
 *
 * Thin on purpose: `check_credit_account` is SECURITY DEFINER and decides what
 * a caller may learn. It answers about one phone at a time and says nothing at
 * all about an inactive account, so this cannot be used to enumerate who has
 * credit — the caller has to already know the number.
 */
export async function checkCreditAccount(phone: string): Promise<CreditAccountCheck> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_credit_account", {
    p_phone: phone,
  });

  if (error || !data) return { found: false };

  const r = data as Record<string, unknown>;
  if (r.found !== true) return { found: false };

  return {
    found: true,
    holderName: (r.holder_name as string | null) ?? null,
    limitPaisa: Number(r.limit_paisa ?? 0),
    outstandingPaisa: Number(r.outstanding_paisa ?? 0),
    availablePaisa: Number(r.available_paisa ?? 0),
  };
}

/**
 * Sweep expired unpaid orders.
 *
 * Called when someone opens the page for an order awaiting payment. The daily
 * Vercel cron is the backstop, but the free tier only allows one run a day,
 * which would let a lapsed order hold stock for hours — and the pay page is
 * exactly where a lapsed order gets looked at.
 *
 * Service role, because cancelling an order is not something the customer
 * looking at it is authorised to do directly.
 */
export async function sweepExpiredOrders(): Promise<void> {
  try {
    const db = createAdminClient();
    await db.rpc("expire_unpaid_orders");
  } catch {
    // Best-effort housekeeping. A visitor trying to pay must never see an
    // error because a background sweep failed.
  }
}

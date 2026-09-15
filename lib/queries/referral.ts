import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * A customer's referral standing and credit.
 *
 * The code is issued on demand by `my_referral_code()` rather than at sign-up,
 * so accounts that never open the page never get a row.
 */

export interface CreditEntry {
  id: string;
  delta_paisa: number;
  reason: string;
  created_at: string;
}

export interface ReferralSummary {
  code: string | null;
  balancePaisa: number;
  pending: number;
  credited: number;
  ledger: CreditEntry[];
  reward: { referrerPaisa: number; referredPaisa: number; enabled: boolean };
}

const DEFAULT_REWARD = { referrerPaisa: 10000, referredPaisa: 5000, enabled: false };

export const getReferralSummary = cache(async (): Promise<ReferralSummary | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [codeRes, balanceRes, refsRes, ledgerRes, settingRes] = await Promise.all([
    supabase.rpc("my_referral_code"),
    supabase.rpc("credit_balance", { p_user: user.id }),
    supabase.from("referrals").select("status").eq("referrer_id", user.id),
    supabase
      .from("credit_ledger")
      .select("id, delta_paisa, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("settings").select("value").eq("key", "referral_reward").maybeSingle(),
  ]);

  const refs = (refsRes.data as { status: string }[] | null) ?? [];
  const cfg = ((settingRes.data as { value: Record<string, unknown> } | null)?.value ??
    {}) as Record<string, unknown>;

  return {
    code: (codeRes.data as string | null) ?? null,
    balancePaisa: Number(balanceRes.data ?? 0),
    pending: refs.filter((r) => r.status === "pending").length,
    credited: refs.filter((r) => r.status === "credited").length,
    ledger: (ledgerRes.data as CreditEntry[] | null) ?? [],
    reward: {
      enabled: cfg.enabled === true,
      referrerPaisa: Number(cfg.referrer_paisa ?? DEFAULT_REWARD.referrerPaisa),
      referredPaisa: Number(cfg.referred_paisa ?? DEFAULT_REWARD.referredPaisa),
    },
  };
});

/** Spendable balance only — used by checkout, which needs nothing else. */
export const getCreditBalance = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data } = await supabase.rpc("credit_balance", { p_user: user.id });
  return Number(data ?? 0);
});

export interface PointsSummary {
  balance: number;
  paisaPerPoint: number;
  minRedeemPoints: number;
  enabled: boolean;
  /** What the balance is worth, capped by nothing — display only. */
  worthPaisa: number;
  ledger: { id: string; delta_points: number; reason: string; created_at: string }[];
}

/**
 * A customer's points standing.
 *
 * Read-only and for display. What a redemption is actually worth is decided by
 * place_order against the same settings row, so a stale page cannot overspend.
 */
export const getPointsSummary = cache(async (): Promise<PointsSummary | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [balanceRes, ledgerRes, settingRes] = await Promise.all([
    supabase.rpc("points_balance", { p_user: user.id }),
    supabase
      .from("points_ledger")
      .select("id, delta_points, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("settings").select("value").eq("key", "points_rules").maybeSingle(),
  ]);

  const cfg = ((settingRes.data as { value: Record<string, unknown> } | null)?.value ??
    {}) as Record<string, unknown>;

  const balance = Number(balanceRes.data ?? 0);
  const paisaPerPoint = Number(cfg.paisa_per_point ?? 100);

  return {
    balance,
    paisaPerPoint,
    minRedeemPoints: Number(cfg.min_redeem_points ?? 0),
    enabled: cfg.enabled === true,
    worthPaisa: balance * paisaPerPoint,
    ledger:
      (ledgerRes.data as PointsSummary["ledger"] | null) ?? [],
  };
});

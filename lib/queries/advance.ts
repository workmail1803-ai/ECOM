import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The partial-payment rule, for display.
 *
 * Checkout uses this to show what the advance comes to before the customer
 * commits. It is NOT what decides the charge — `place_order` recomputes the
 * split from the same settings row and ignores anything the client sends.
 * This exists so the number is visible, not so the browser can choose it.
 */
export interface AdvanceRule {
  enabled: boolean;
  percent: number;
  minPaisa: number;
}

const FALLBACK: AdvanceRule = { enabled: false, percent: 10, minPaisa: 20000 };

export const getAdvanceRule = cache(async (): Promise<AdvanceRule> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "advance_payment")
    .maybeSingle();

  const v = (data as { value: unknown } | null)?.value as
    | Partial<Record<keyof AdvanceRule, unknown>>
    | undefined;
  if (!v) return FALLBACK;

  const percent = Number(v.percent);
  const minPaisa = Number(v.minPaisa ?? (v as Record<string, unknown>).min_paisa);

  return {
    enabled: v.enabled === true,
    percent: Number.isFinite(percent) && percent > 0 && percent <= 100 ? percent : 10,
    minPaisa: Number.isFinite(minPaisa) && minPaisa >= 0 ? minPaisa : 20000,
  };
});

/**
 * How long a prepaid order may sit unpaid.
 *
 * Read from settings so the shop can change it without a deploy; the same row
 * is what place_order stamps `payment_due_at` from, so the number shown at
 * checkout is the number enforced.
 */
export const getPaymentWindowMinutes = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "payment_window")
    .maybeSingle();

  const minutes = Number(
    ((data as { value: Record<string, unknown> } | null)?.value ?? {}).minutes,
  );
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
});

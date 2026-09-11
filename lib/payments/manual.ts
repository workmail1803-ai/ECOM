import type { PaymentProvider, PaymentInitInput, PaymentInitResult } from "./types";

/**
 * Manual bKash / Nagad verification.
 *
 * The customer sends money themselves from their own wallet app, then submits
 * the transaction id and a screenshot. Staff look at both and approve.
 *
 * There is no gateway call here, so `initiate()` does not talk to anything — it
 * just points the customer at our own submission page. The order is created
 * with payment_status 'pending' and can ONLY become 'successful' through
 * `verify_manual_payment()`, which requires a staff account. That is the whole
 * security model: a human with a name attached decides, and the database
 * records who and when.
 *
 * These are used automatically when the corresponding gateway credentials are
 * absent — see the resolver in ./index.ts. The customer sees the same "bKash"
 * option either way; only the flow behind it differs.
 */

function manualProvider(
  id: "bkash" | "nagad",
  label: string,
  icon: string,
): PaymentProvider {
  return {
    id,
    label,
    description: `Send money from your ${label} app, then submit the transaction ID. We verify it before dispatch.`,
    icon,

    // Nothing to configure in env — the receive number lives in `settings` so
    // an admin can change it without a deploy.
    isConfigured: () => true,

    async initiate(input: PaymentInitInput): Promise<PaymentInitResult> {
      return {
        kind: "manual",
        submitPath: `/order/pay?ref=${encodeURIComponent(input.orderNumber)}`,
      };
    },
  };
}

export const bkashManualProvider = manualProvider("bkash", "bKash", "Smartphone");
export const nagadManualProvider = manualProvider("nagad", "Nagad", "Wallet");

/** Which settings keys hold the receive number for a given method. */
export const MANUAL_ACCOUNT_KEYS = {
  bkash: { number: "bkash_receive_number", type: "bkash_account_type" },
  nagad: { number: "nagad_receive_number", type: "nagad_account_type" },
} as const;

export type ManualMethod = keyof typeof MANUAL_ACCOUNT_KEYS;

export function isManualMethod(v: string): v is ManualMethod {
  return v === "bkash" || v === "nagad";
}

/**
 * Manual submissions are marked by the shape of `payments.idempotency_key`.
 *
 * That column already carries a partial UNIQUE index, which is exactly the
 * guarantee this feature needs: one transaction ID can be claimed against one
 * order and no other. Reusing it means manual verification needs no schema
 * change at all — the alternative was an `is_manual` boolean plus a second
 * unique index doing the same job.
 */
export const MANUAL_KEY_PREFIX = "manual:";

export function manualIdempotencyKey(provider: ManualMethod, txnId: string): string {
  return `${MANUAL_KEY_PREFIX}${provider}:${txnId.trim().toUpperCase()}`;
}

/** True when this payment row came from a customer-submitted transfer. */
export function isManualSubmission(idempotencyKey: string | null): boolean {
  return Boolean(idempotencyKey?.startsWith(MANUAL_KEY_PREFIX));
}

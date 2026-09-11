"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { bdPhone } from "@/lib/validations/checkout";
import { isManualMethod, manualIdempotencyKey } from "@/lib/payments/manual";

/**
 * Customer submission of a manual bKash/Nagad transfer.
 *
 * Two things carry the security here, and neither is the UI:
 *
 *  1. The order number alone is not enough — it comes from a sequence and is
 *     guessable. The mobile number ON the order is the second factor, the same
 *     rule order tracking uses.
 *  2. `payments.idempotency_key` carries a UNIQUE index, and a manual
 *     submission writes `manual:<provider>:<TXN>` into it. That is what makes
 *     one transaction ID claimable against exactly one order — enforced by
 *     Postgres, not by a check in this file that a race could slip past.
 *
 * Nothing here marks an order paid. The status only reaches 'pending', and a
 * staff member decides from /admin/payments.
 */

const PROOF_MIME = ["image/jpeg", "image/png", "image/webp"];
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

const proofSchema = z.object({
  order_number: z.string().trim().min(3).max(24).transform((v) => v.toUpperCase()),
  phone: bdPhone,
  txn_id: z
    .string()
    .trim()
    .min(4, "Enter the transaction ID from your payment SMS")
    .max(40)
    .transform((v) => v.toUpperCase()),
  sender_msisdn: bdPhone,
});

export interface ProofState {
  ok: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}

/** Same wording for "no such order" and "wrong phone" — see note above. */
const NO_MATCH =
  "No order matches that number and mobile number. Check both and try again.";

export async function submitPaymentProof(
  _prev: ProofState,
  formData: FormData,
): Promise<ProofState> {
  const parsed = proofSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }

  const input = parsed.data;
  const db = createAdminClient();

  // ── Identify the order ────────────────────────────────────────────────────
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, customer_phone, status, payment_method, total_paisa")
    .eq("order_number", input.order_number)
    .maybeSingle<{
      id: string;
      order_number: string;
      customer_phone: string;
      status: string;
      payment_method: string;
      total_paisa: number;
    }>();

  if (!order || order.customer_phone !== input.phone) {
    return { ok: false, error: NO_MATCH };
  }
  if (order.status === "cancelled" || order.status === "returned") {
    return {
      ok: false,
      error: "This order was cancelled, so a payment cannot be attached to it.",
    };
  }
  if (!isManualMethod(order.payment_method)) {
    return { ok: false, error: "This order was not placed with bKash or Nagad." };
  }

  // ── The payment row place_order() created ─────────────────────────────────
  const { data: payment } = await db
    .from("payments")
    .select("id, status, amount_paisa, provider")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      status: string;
      amount_paisa: number;
      provider: string;
    }>();

  if (!payment) {
    return { ok: false, error: "We could not find a payment for that order." };
  }
  if (payment.status === "successful") {
    return {
      ok: false,
      error: "This order is already marked paid — there is nothing more to send.",
    };
  }

  // ── Screenshot ────────────────────────────────────────────────────────────
  // Uploaded only after the order/phone pair checks out, so a wrong guess never
  // costs us a stored file. The bucket has no client write policy at all.
  let screenshotPath: string | null = null;
  const file = formData.get("screenshot");

  if (file instanceof File && file.size > 0) {
    if (!PROOF_MIME.includes(file.type)) {
      return {
        ok: false,
        error: "The screenshot must be a JPG, PNG or WebP image.",
        fieldErrors: { screenshot: "Unsupported image type" },
      };
    }
    if (file.size > PROOF_MAX_BYTES) {
      return {
        ok: false,
        error: "That screenshot is larger than 5 MB. Please compress it and try again.",
        fieldErrors: { screenshot: "Maximum 5 MB" },
      };
    }

    const ext =
      file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    // Foldered by order so staff can find every attempt, suffixed randomly so a
    // re-submission never overwrites the first try.
    const path = `${order.order_number}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await db.storage
      .from("payment-proofs")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      return { ok: false, error: "We could not upload that screenshot. Please try again." };
    }
    screenshotPath = path;
  }

  // ── Record the claim ──────────────────────────────────────────────────────
  // The unique index on idempotency_key is what rejects a transaction ID that
  // has already been claimed elsewhere.
  const { error: claimError } = await db
    .from("payments")
    .update({
      provider_txn_id: input.txn_id,
      idempotency_key: manualIdempotencyKey(
        order.payment_method as "bkash" | "nagad",
        input.txn_id,
      ),
      status: "pending",
      // A re-submission after a rejection clears the previous verdict.
      failure_reason: null,
    })
    .eq("id", payment.id);

  if (claimError) {
    if (claimError.code === "23505") {
      // Cleaning up keeps the bucket free of files attached to nothing.
      if (screenshotPath) {
        await db.storage.from("payment-proofs").remove([screenshotPath]);
      }
      return {
        ok: false,
        error:
          "That transaction ID has already been submitted against another order. Check the ID and try again.",
        fieldErrors: { txn_id: "Already used" },
      };
    }
    if (screenshotPath) {
      await db.storage.from("payment-proofs").remove([screenshotPath]);
    }
    return { ok: false, error: "We could not record that payment. Please try again." };
  }

  // Everything the verifier needs that `payments` has no column for.
  await db.from("payment_transactions").insert({
    payment_id: payment.id,
    event: "manual_submit",
    status: "pending",
    amount_paisa: payment.amount_paisa,
    payload: {
      txn_id: input.txn_id,
      sender_msisdn: input.sender_msisdn,
      screenshot_path: screenshotPath,
      submitted_at: new Date().toISOString(),
      expected_paisa: order.total_paisa,
    },
  });

  await db
    .from("orders")
    .update({ payment_status: "pending" })
    .eq("id", order.id);

  revalidatePath("/account/orders");
  revalidatePath("/admin/payments");

  return {
    ok: true,
    message:
      "Payment details received. We will verify the transaction and confirm your order shortly.",
  };
}

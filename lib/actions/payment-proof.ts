"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bdPhone } from "@/lib/validations/checkout";

/**
 * Customer submission of a manual bKash/Nagad transfer.
 *
 * The order number alone is not enough to submit against an order — it comes
 * from a sequence and is guessable. The mobile number on the order is the
 * second factor, exactly as it is for order tracking.
 *
 * The screenshot is uploaded server-side with the service-role client AFTER
 * that check passes. The `payment-proofs` bucket has no client write policy at
 * all, so an anonymous visitor can never put a file in storage merely because
 * guest checkout exists.
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

function submitError(message: string): string {
  if (message.includes("txn_already_used"))
    return "That transaction ID has already been submitted against another order. Check the ID and try again.";
  if (message.includes("order_not_found"))
    return "No order matches that number and mobile number. Check both and try again.";
  if (message.includes("already_paid"))
    return "This order is already marked paid — there is nothing more to send.";
  if (message.includes("order_closed"))
    return "This order was cancelled, so a payment cannot be attached to it.";
  if (message.includes("txn_required")) return "Enter the transaction ID.";
  if (message.includes("not_a_manual_method"))
    return "This order was not placed with bKash or Nagad.";
  return "We could not record that payment. Please try again.";
}

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
  const admin = createAdminClient();

  // Confirm the order/phone pair BEFORE touching storage, so a bad guess never
  // costs us an uploaded file.
  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, customer_phone, status")
    .eq("order_number", input.order_number)
    .maybeSingle<{
      id: string;
      order_number: string;
      customer_phone: string;
      status: string;
    }>();

  if (!order || order.customer_phone !== input.phone) {
    // One message for both cases, so this cannot be used to discover which
    // order numbers exist.
    return {
      ok: false,
      error: "No order matches that number and mobile number. Check both and try again.",
    };
  }

  // ── Screenshot (optional but strongly encouraged) ─────────────────────────
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

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    // Foldered by order number so staff can find every attempt for one order,
    // and suffixed randomly so a re-submission never overwrites the first try.
    const path = `${order.order_number}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from("payment-proofs")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      return {
        ok: false,
        error: "We could not upload that screenshot. Please try again.",
      };
    }
    screenshotPath = path;
  }

  // The RPC re-checks the order/phone pair itself — this action's earlier check
  // is a courtesy to storage, not the authorization.
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_payment_proof", {
    p_order_number: input.order_number,
    p_phone: input.phone,
    p_txn_id: input.txn_id,
    p_sender_msisdn: input.sender_msisdn,
    p_screenshot_path: screenshotPath,
  });

  if (error) {
    // Do not leave an orphaned file behind if the submission was rejected.
    if (screenshotPath) {
      await admin.storage.from("payment-proofs").remove([screenshotPath]);
    }
    return { ok: false, error: submitError(error.message) };
  }

  revalidatePath("/account/orders");
  revalidatePath("/admin/payments");

  return {
    ok: true,
    message:
      "Payment details received. We will verify the transaction and confirm your order shortly.",
  };
}

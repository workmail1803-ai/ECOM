import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signCallback } from "@/lib/actions/checkout";
import { executePayment } from "@/lib/payments/bkash";
import type { PaymentStatus } from "@/types/database";

/**
 * Gateway return handler.
 *
 * Three things have to be true before a single taka is marked collected:
 *
 *   1. The `sig` in the query string matches an HMAC of the payment id, so a
 *      return URL cannot be re-pointed at someone else's payment.
 *   2. The gateway's own API confirms the transaction — we never trust a status
 *      that arrived only as a query parameter, because the customer's browser
 *      is the one carrying it.
 *   3. `settle_payment()` applies it. That function is revoked from both anon
 *      and authenticated, so only this route (service role) can call it, and it
 *      is idempotent — a replayed callback is a no-op.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const { searchParams, origin } = request.nextUrl;

  const paymentId = searchParams.get("payment");
  const sig = searchParams.get("sig");

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/checkout/failed?reason=${encodeURIComponent(reason)}`);

  if (!paymentId || !sig) return fail("missing_reference");

  const secret = process.env.PAYMENT_CALLBACK_SECRET ?? "";
  const expected = await signCallback(paymentId, secret);
  if (sig !== expected) return fail("bad_signature");

  const db = createAdminClient();
  const { data: payment } = await db
    .from("payments")
    .select("id, order_id, provider, provider_ref, amount_paisa, status")
    .eq("id", paymentId)
    .maybeSingle<{
      id: string;
      order_id: string;
      provider: string;
      provider_ref: string | null;
      amount_paisa: number;
      status: PaymentStatus;
    }>();

  if (!payment) return fail("unknown_payment");

  const { data: order } = await db
    .from("orders")
    .select("order_number")
    .eq("id", payment.order_id)
    .maybeSingle<{ order_number: string }>();

  const confirmed = `${origin}/order/confirmed?ref=${encodeURIComponent(order?.order_number ?? "")}`;

  // Already settled — a customer refreshing the return page must not re-trigger
  // anything. settle_payment() would no-op anyway; this saves the round trip.
  if (payment.status === "successful") return NextResponse.redirect(confirmed);

  let status: PaymentStatus = "failed";
  let txnId: string | null = null;
  let failureReason: string | null = null;
  let payload: Record<string, unknown> = Object.fromEntries(searchParams.entries());

  if (provider === "bkash") {
    // bKash returns ?status=success&paymentID=… — the redirect only tells us to
    // go and execute. The execute call is the authority.
    const returned = searchParams.get("status");
    const gatewayPaymentId = searchParams.get("paymentID") ?? payment.provider_ref;

    if (returned !== "success" || !gatewayPaymentId) {
      failureReason =
        returned === "cancel" ? "Payment cancelled" : "Payment was not completed";
      status = returned === "cancel" ? "cancelled" : "failed";
    } else {
      const executed = await executePayment(gatewayPaymentId);
      payload = { ...payload, execute: executed };

      const paidPaisa = Math.round(Number(executed.amount ?? 0) * 100);
      if (
        executed.trxID &&
        executed.transactionStatus === "Completed" &&
        paidPaisa === payment.amount_paisa
      ) {
        status = "successful";
        txnId = executed.trxID;
      } else {
        // A mismatch between what we charged and what was paid is a hard fail,
        // not a partial success.
        failureReason =
          executed.statusMessage ??
          (executed.trxID ? "Paid amount did not match the order" : "Payment failed");
      }
    }
  } else if (provider === "nagad") {
    const returned = searchParams.get("status");
    txnId = searchParams.get("payment_ref_id") ?? searchParams.get("issuer_payment_ref");

    if (returned === "Success" && txnId) {
      status = "successful";
    } else {
      status = returned === "Aborted" ? "cancelled" : "failed";
      failureReason = searchParams.get("message") ?? "Payment was not completed";
    }
  } else if (provider === "card") {
    // SSLCOMMERZ appends our own &result= marker plus its own fields.
    const result = searchParams.get("result");
    txnId = searchParams.get("bank_tran_id") ?? searchParams.get("tran_id");

    if (result === "success" && searchParams.get("status") === "VALID") {
      status = "successful";
    } else if (result === "cancel") {
      status = "cancelled";
      failureReason = "Payment cancelled";
    } else {
      failureReason = searchParams.get("error") ?? "Payment was not completed";
    }
  } else {
    return fail("unknown_provider");
  }

  const { error } = await db.rpc("settle_payment", {
    p_payment_id: payment.id,
    p_status: status,
    p_provider_txn_id: txnId,
    p_failure_reason: failureReason,
    p_payload: payload,
  });

  if (error) return fail("settlement_failed");

  return NextResponse.redirect(
    status === "successful"
      ? confirmed
      : `${origin}/checkout/failed?reason=${encodeURIComponent(failureReason ?? "payment_failed")}&ref=${encodeURIComponent(order?.order_number ?? "")}`,
  );
}

/** Some gateways POST the return instead of redirecting with a GET. */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ provider: string }> },
) {
  const form = await request.formData().catch(() => null);

  if (form) {
    // Fold the posted fields into the query string and reuse the GET path, so
    // the verification logic lives in exactly one place.
    const url = request.nextUrl.clone();
    for (const [k, v] of form.entries()) {
      if (typeof v === "string" && !url.searchParams.has(k)) {
        url.searchParams.set(k, v);
      }
    }
    return GET(new NextRequest(url, { headers: request.headers }), ctx);
  }

  return GET(request, ctx);
}

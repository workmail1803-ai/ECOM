import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Smartphone, Wallet, Copy, ShieldCheck, Clock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreSettings } from "@/lib/queries/settings";
import {
  MANUAL_ACCOUNT_KEYS,
  isManualMethod,
  isManualSubmission,
} from "@/lib/payments/manual";
import { PaymentProofForm } from "@/components/checkout/payment-proof-form";
import { CopyableNumber } from "@/components/checkout/copyable-number";
import { Card, Badge } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";

export const metadata: Metadata = {
  title: "Complete your payment",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

interface PayOrder {
  id: string;
  order_number: string;
  total_paisa: number;
  payment_method: string;
  payment_status: string;
  status: string;
}

/**
 * Manual bKash/Nagad payment page.
 *
 * Shows the number to send money to and collects the transaction id, the
 * sender's number and a screenshot. Nothing here marks the order paid — the
 * submission goes into a staff queue at /admin/payments.
 */
export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  if (!ref) notFound();

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, total_paisa, payment_method, payment_status, status")
    .eq("order_number", ref.toUpperCase())
    .maybeSingle<PayOrder>();

  if (!order) notFound();

  const method = order.payment_method;
  if (!isManualMethod(method)) {
    // Wrong flow for this order — send them somewhere useful rather than 404.
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-ink">Nothing to pay here</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Order {order.order_number} was not placed with bKash or Nagad.
        </p>
        <Link
          href={`/track?ref=${order.order_number}`}
          className="mt-4 inline-block text-sm font-medium text-brand-600"
        >
          Track this order instead
        </Link>
      </div>
    );
  }

  const settings = (await getStoreSettings()) as Record<string, unknown> &
    Awaited<ReturnType<typeof getStoreSettings>>;

  const keys = MANUAL_ACCOUNT_KEYS[method];
  const receiveNumber = String(settings[keys.number] ?? "");
  const accountType = String(settings[keys.type] ?? "Personal");
  const note = String(
    settings["manual_payment_note"] ??
      "Send the exact total, then enter the transaction ID you receive by SMS.",
  );

  const label = method === "bkash" ? "bKash" : "Nagad";
  const Icon = method === "bkash" ? Smartphone : Wallet;
  const accent = method === "bkash" ? "#E2136E" : "#EE7623";

  // `place_order()` leaves every non-COD order at payment_status 'pending', so
  // that field cannot distinguish "waiting for the customer to send money" from
  // "customer has submitted and we are checking". The payment row can: a manual
  // submission stamps the marker into idempotency_key.
  const { data: payment } = await admin
    .from("payments")
    .select("status, idempotency_key, failure_reason")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      status: string;
      idempotency_key: string | null;
      failure_reason: string | null;
    }>();

  const submitted = isManualSubmission(payment?.idempotency_key ?? null);
  const alreadyPaid = payment?.status === "successful";
  const awaiting = submitted && payment?.status === "pending";
  const rejected = submitted && payment?.status === "failed";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: accent }}
        >
          <Icon size={22} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Pay with {label}
          </h1>
          <p className="text-sm text-ink-muted tabular">
            Order {order.order_number}
          </p>
        </div>
      </div>

      {alreadyPaid ? (
        <Card className="mt-6 border-success/25 bg-success-soft p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <ShieldCheck size={16} />
            This payment has already been verified.
          </p>
          <Link
            href={`/track?ref=${order.order_number}`}
            className="mt-2 inline-block text-sm font-medium text-brand-600"
          >
            Track your order →
          </Link>
        </Card>
      ) : (
        <>
          {rejected ? (
            <Card className="mt-6 border-danger/25 bg-danger-soft p-4">
              <p className="text-sm font-semibold text-danger">
                We could not verify your last submission.
              </p>
              <p className="mt-1 text-xs leading-5 text-danger/85">
                {payment?.failure_reason ??
                  "Check the transaction ID against your payment SMS and submit it again below."}
              </p>
            </Card>
          ) : awaiting ? (
            <Card className="mt-6 border-warning/25 bg-warning-soft p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-warning">
                <Clock size={15} />
                We already have a submission for this order and are checking it.
              </p>
              <p className="mt-1 text-xs text-warning/80">
                If you sent the money again or mistyped the transaction ID, submit
                the correct details below and we will use the latest one.
              </p>
            </Card>
          ) : null}

          {/* Step 1 — how much, and where to send it. */}
          <Card className="mt-4 p-5">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                1
              </span>
              <h2 className="text-base font-semibold text-ink">
                Send exactly {formatTaka(order.total_paisa)}
              </h2>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-surface-sunken p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                {label} {accountType} number
              </p>
              <CopyableNumber value={receiveNumber} />
              <p className="mt-2 text-xs text-ink-muted">
                Open your {label} app → Send Money → paste this number → enter{" "}
                <span className="font-semibold text-ink tabular">
                  {formatTaka(order.total_paisa, { withSymbol: false })}
                </span>{" "}
                as the amount.
              </p>
            </div>

            <p className="mt-3 flex gap-2 text-xs leading-5 text-ink-muted">
              <Copy size={13} className="mt-0.5 shrink-0" />
              Send the exact amount. A different figure takes longer to match against
              your order.
            </p>
          </Card>

          {/* Step 2 — prove it. */}
          <Card className="mt-4 p-5">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                2
              </span>
              <h2 className="text-base font-semibold text-ink">
                Submit your transaction ID
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{note}</p>

            <PaymentProofForm
              orderNumber={order.order_number}
              method={method}
              label={label}
            />
          </Card>

          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-ink-muted">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-success" />
            Your order is already saved. Nothing is dispatched until a member of our
            team has checked the transaction against our {label} statement.
          </p>
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-4 border-t border-line pt-4 text-sm">
        <Link href={`/track?ref=${order.order_number}`} className="text-brand-600">
          Track this order
        </Link>
        <Link href="/products" className="text-ink-muted hover:text-ink">
          Keep shopping
        </Link>
        <Link href="/contact" className="text-ink-muted hover:text-ink">
          Need help?
        </Link>
      </div>
    </div>
  );
}

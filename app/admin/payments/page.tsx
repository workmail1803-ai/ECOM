import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabledProviders, isManualFlow } from "@/lib/payments";
import { listManualPayments } from "@/lib/queries/admin";
import { ManualPaymentCard } from "@/components/admin/manual-payment-card";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";
import type { Payment } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  await requirePermission("payments");
  const db = createAdminClient();

  // The manual-payment queue does not depend on this list, so it is fetched
  // alongside it rather than after it.
  const [{ data }, manual] = await Promise.all([
    db.from("payments").select("*").order("created_at", { ascending: false }).limit(150),
    listManualPayments(),
  ]);

  const payments = (data ?? []) as Payment[];

  const { data: orders } = payments.length
    ? await db
        .from("orders")
        .select("id, order_number, customer_name")
        .in("id", payments.map((p) => p.order_id))
    : { data: [] };

  const orderById = new Map(
    ((orders ?? []) as { id: string; order_number: string; customer_name: string }[]).map(
      (o) => [o.id, o],
    ),
  );

  const live = enabledProviders();
  const manualEnabled = live.some((p) => isManualFlow(p.id));

  const pendingManual = manual.filter(
    (m) => m.status === "pending" || m.status === "initiated",
  );
  const settledManual = manual.filter(
    (m) => m.status === "successful" || m.status === "failed",
  );
  const settled = payments.filter((p) => p.status === "successful");
  const collected = settled.reduce((s, p) => s + p.amount_paisa, 0);
  const outstanding = payments
    .filter((p) => p.status === "pending" || p.status === "initiated")
    .reduce((s, p) => s + p.amount_paisa, 0);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Manual bKash and Nagad transfers are settled by a staff decision. Gateway payments settle by verified callback; COD settles when an order is marked delivered."
      />

      {/* The verification queue comes first: nothing ships until it is clear. */}
      {pendingManual.length > 0 ? (
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold text-ink">
              Awaiting verification
            </h2>
            <span className="rounded-full bg-warning px-2 py-0.5 text-[11px] font-bold tabular text-white">
              {pendingManual.length}
            </span>
          </div>
          <p className="mb-3 text-xs leading-5 text-ink-muted">
            Check each transaction ID against your wallet statement before
            approving. Approving marks the order paid and confirms it; rejecting
            leaves the order open so the customer can resubmit.
          </p>
          <div className="space-y-3">
            {pendingManual.map((row) => (
              <ManualPaymentCard key={row.id} row={row} />
            ))}
          </div>
        </section>
      ) : manualEnabled ? (
        <section className="mb-6 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Awaiting verification</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Nothing to check right now. Customer bKash and Nagad submissions
            appear here the moment they are sent.
          </p>
        </section>
      ) : null}

      {settledManual.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 text-base font-semibold text-ink">
            Recently decided
          </h2>
          <div className="space-y-3">
            {settledManual.slice(0, 5).map((row) => (
              <ManualPaymentCard key={row.id} row={row} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-ink-muted">Collected</p>
          <p className="mt-1 text-2xl font-bold tabular text-success">
            {formatTaka(collected)}
          </p>
          <p className="text-xs text-ink-faint">{settled.length} settled payments</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-muted">Outstanding</p>
          <p className="mt-1 text-2xl font-bold tabular text-warning">
            {formatTaka(outstanding)}
          </p>
          <p className="text-xs text-ink-faint">Pending or awaiting the gateway</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-muted">Live methods</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {live.map((p) => (
              <Badge key={p.id} tone="success">
                {p.label}
              </Badge>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-faint">
            A method without credentials is hidden at checkout, not shown broken.
          </p>
        </Card>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon={<CreditCard size={30} />}
          title="No payments recorded"
          description="A payment row is created for every order, including cash on delivery."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-175 text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-3 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Method</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Gateway reference</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {payments.map((p) => {
                const order = orderById.get(p.order_id);
                return (
                  <tr key={p.id} className="hover:bg-surface-sunken">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${p.order_id}`}
                        className="font-medium tabular text-ink hover:text-brand-700"
                      >
                        {order?.order_number ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-ink-muted">
                      {order?.customer_name ?? "—"}
                    </td>
                    <td className="px-3 py-3 capitalize text-ink-muted">
                      {p.provider === "cod" ? "Cash on delivery" : p.provider}
                    </td>
                    <td className="px-3 py-3 text-right tabular font-medium text-ink">
                      {formatTaka(p.amount_paisa)}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-ink-faint tabular">
                      {p.provider_txn_id ?? p.provider_ref ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        tone={
                          p.status === "successful"
                            ? "success"
                            : p.status === "failed" || p.status === "cancelled"
                              ? "danger"
                              : p.status === "refunded"
                                ? "warning"
                                : "neutral"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      {new Date(p.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

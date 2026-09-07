import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabledProviders } from "@/lib/payments";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";
import type { Payment } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  await requireStaff();
  const db = createAdminClient();

  const { data } = await db
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(150);

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
  const settled = payments.filter((p) => p.status === "successful");
  const collected = settled.reduce((s, p) => s + p.amount_paisa, 0);
  const outstanding = payments
    .filter((p) => p.status === "pending" || p.status === "initiated")
    .reduce((s, p) => s + p.amount_paisa, 0);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Online payments are settled by verified gateway callbacks only. COD settles when an order is marked delivered."
      />

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

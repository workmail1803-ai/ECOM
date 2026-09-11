import Link from "next/link";
import { ShoppingBag, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { listAdminOrders } from "@/lib/queries/admin";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABEL } from "@/components/checkout/order-timeline";
import { formatTaka } from "@/lib/utils/money";
import type { OrderStatus } from "@/types/database";

export const dynamic = "force-dynamic";

const TONE: Record<OrderStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  placed: "warning",
  confirmed: "brand",
  processing: "brand",
  shipped: "brand",
  out_for_delivery: "warning",
  delivered: "success",
  cancelled: "danger",
  returned: "warning",
};

const TABS: (OrderStatus | "all")[] = [
  "all",
  "placed",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requirePermission("orders");
  const { status, q } = await searchParams;
  const active = (status ?? "all") as OrderStatus | "all";

  const orders = await listAdminOrders({ status: active, q });

  return (
    <>
      <PageHeader
        title="Orders"
        description={`${orders.length} ${orders.length === 1 ? "order" : "orders"} shown.`}
      />

      <Card className="mb-4 space-y-3 p-3">
        <form className="flex gap-2" action="/admin/orders">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Order number, phone or customer name…"
            className="h-9 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
          />
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
        </form>

        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <Link
              key={t}
              href={`/admin/orders?status=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium capitalize ${
                active === t
                  ? "bg-brand-600 text-white"
                  : "text-ink-soft hover:bg-surface-sunken"
              }`}
            >
              {t === "all" ? "All" : ORDER_STATUS_LABEL[t]}
            </Link>
          ))}
        </div>
      </Card>

      {orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={30} />}
          title="No orders here"
          description="Orders appear the moment a customer checks out."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-200 text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-3 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Destination</th>
                <th className="px-3 py-3 text-right font-medium">Items</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-3 py-3 font-medium">Payment</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-surface-sunken">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-medium tabular text-ink hover:text-brand-700"
                    >
                      {o.order_number}
                    </Link>
                    <p className="text-[11px] text-ink-faint">
                      {new Date(o.placed_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </td>

                  <td className="px-3 py-3">
                    <p className="text-ink">{o.customer_name}</p>
                    <p className="text-[11px] text-ink-muted tabular">
                      {o.customer_phone}
                    </p>
                  </td>

                  <td className="px-3 py-3 text-xs text-ink-muted">
                    {o.shipping_area}
                    <br />
                    {o.shipping_district}
                  </td>

                  <td className="px-3 py-3 text-right tabular text-ink-muted">
                    {o.item_count}
                  </td>

                  <td className="px-3 py-3 text-right tabular font-semibold text-ink">
                    {formatTaka(o.total_paisa)}
                  </td>

                  <td className="px-3 py-3">
                    <Badge
                      tone={
                        o.payment_status === "successful"
                          ? "success"
                          : o.payment_status === "failed"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {o.payment_method === "cod" ? "COD" : o.payment_method}
                    </Badge>
                  </td>

                  <td className="px-3 py-3">
                    <Badge tone={TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken hover:text-ink"
                      aria-label={`Open ${o.order_number}`}
                    >
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

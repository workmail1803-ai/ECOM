import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevenueSeries } from "@/lib/queries/admin";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { PageHeader, Card, Badge } from "@/components/ui/primitives";
import { formatTaka, formatTakaCompact } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

/**
 * Sales and profit reporting.
 *
 * Margin needs `products.cost_paisa`, which is revoked for both client roles at
 * the column level — only the service-role client can read it, which is why
 * this page is admin-side and its numbers never reach the storefront.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireStaff();
  const { days } = await searchParams;
  const window = Math.min(180, Math.max(7, Number(days) || 30));

  const db = createAdminClient();
  const from = new Date();
  from.setDate(from.getDate() - window);
  from.setHours(0, 0, 0, 0);

  const [series, { data: orders }, { data: lines }] = await Promise.all([
    getRevenueSeries(window),
    db
      .from("orders")
      .select("id, total_paisa, subtotal_paisa, discount_paisa, delivery_fee_paisa, status, payment_method")
      .gte("placed_at", from.toISOString()),
    db
      .from("order_items")
      .select("product_id, product_name, quantity, line_total_paisa, orders!inner(placed_at, status)")
      .gte("orders.placed_at", from.toISOString())
      .not("orders.status", "in", "(cancelled,returned)"),
  ]);

  const allOrders = (orders ?? []) as {
    id: string;
    total_paisa: number;
    subtotal_paisa: number;
    discount_paisa: number;
    delivery_fee_paisa: number;
    status: string;
    payment_method: string;
  }[];

  const valid = allOrders.filter(
    (o) => o.status !== "cancelled" && o.status !== "returned",
  );

  const revenue = valid.reduce((s, o) => s + o.total_paisa, 0);
  const discounts = valid.reduce((s, o) => s + o.discount_paisa, 0);
  const delivery = valid.reduce((s, o) => s + o.delivery_fee_paisa, 0);
  const cancelled = allOrders.length - valid.length;
  const aov = valid.length ? Math.round(revenue / valid.length) : 0;

  const soldLines = (lines ?? []) as unknown as {
    product_id: string | null;
    product_name: string;
    quantity: number;
    line_total_paisa: number;
  }[];

  const productIds = [...new Set(soldLines.map((l) => l.product_id).filter(Boolean))];
  const { data: costs } = productIds.length
    ? await db.from("products").select("id, cost_paisa").in("id", productIds)
    : { data: [] };

  const costById = new Map(
    ((costs ?? []) as { id: string; cost_paisa: number | null }[]).map((c) => [
      c.id,
      c.cost_paisa ?? 0,
    ]),
  );

  const cogs = soldLines.reduce(
    (s, l) => s + (costById.get(l.product_id ?? "") ?? 0) * l.quantity,
    0,
  );
  const grossProfit = soldLines.reduce((s, l) => s + l.line_total_paisa, 0) - cogs;

  // Per-product performance, ranked by units.
  const byProduct = new Map<
    string,
    { name: string; units: number; revenue: number; cost: number }
  >();
  for (const l of soldLines) {
    const key = l.product_id ?? l.product_name;
    const entry = byProduct.get(key) ?? {
      name: l.product_name,
      units: 0,
      revenue: 0,
      cost: 0,
    };
    entry.units += l.quantity;
    entry.revenue += l.line_total_paisa;
    entry.cost += (costById.get(l.product_id ?? "") ?? 0) * l.quantity;
    byProduct.set(key, entry);
  }

  const ranked = [...byProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  const byMethod = new Map<string, number>();
  for (const o of valid) {
    byMethod.set(o.payment_method, (byMethod.get(o.payment_method) ?? 0) + 1);
  }

  const windows = [7, 30, 90, 180];

  const tiles = [
    { label: "Revenue", value: formatTakaCompact(revenue), sub: `${valid.length} orders` },
    { label: "Gross profit", value: formatTakaCompact(grossProfit), sub: "Revenue − cost of goods" },
    { label: "Cost of goods", value: formatTakaCompact(cogs), sub: "From product cost" },
    { label: "Average order", value: formatTaka(aov), sub: "Per valid order" },
    { label: "Discounts given", value: formatTakaCompact(discounts), sub: "Coupons applied" },
    { label: "Delivery collected", value: formatTakaCompact(delivery), sub: "Shipping fees" },
    { label: "Cancelled / returned", value: String(cancelled), sub: "Excluded from revenue" },
    {
      label: "Margin",
      value: revenue > 0 ? `${Math.round((grossProfit / revenue) * 100)}%` : "—",
      sub: "Gross profit ÷ revenue",
    },
  ];

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Last ${window} days. Cancelled and returned orders are excluded throughout.`}
      />

      <div className="mb-4 flex gap-1">
        {windows.map((d) => (
          <Link
            key={d}
            href={`/admin/reports?days=${d}`}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
              window === d ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-surface-sunken"
            }`}
          >
            {d} days
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-xs font-medium text-ink-muted">{t.label}</p>
            <p className="mt-1.5 text-xl font-bold tabular tracking-tight text-ink">
              {t.value}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-faint">{t.sub}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold text-ink">Revenue over time</h2>
        <RevenueChart data={series} />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Product performance</h2>
          <p className="text-xs text-ink-muted">Top 20 by revenue in this window.</p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-150 text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 text-right font-medium">Units</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                  <th className="pb-2 text-right font-medium">Profit</th>
                  <th className="pb-2 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ranked.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-ink-muted">
                      No sales in this window.
                    </td>
                  </tr>
                ) : (
                  ranked.map((p) => {
                    const profit = p.revenue - p.cost;
                    const pct = p.revenue ? Math.round((profit / p.revenue) * 100) : 0;
                    return (
                      <tr key={p.name}>
                        <td className="py-2.5">
                          <span className="clamp-2 font-medium text-ink">{p.name}</span>
                        </td>
                        <td className="py-2.5 text-right tabular text-ink-muted">
                          {p.units}
                        </td>
                        <td className="py-2.5 text-right tabular text-ink">
                          {formatTaka(p.revenue)}
                        </td>
                        <td className="py-2.5 text-right tabular">
                          <span className={profit >= 0 ? "text-success" : "text-danger"}>
                            {formatTaka(profit)}
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular text-ink-muted">
                          {p.cost > 0 ? `${pct}%` : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Payment mix</h2>
          {byMethod.size === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No orders in this window.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {[...byMethod.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([method, count]) => {
                  const pct = Math.round((count / valid.length) * 100);
                  return (
                    <li key={method}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize text-ink">
                          {method === "cod" ? "Cash on delivery" : method}
                        </span>
                        <span className="tabular text-ink-muted">
                          {count} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full bg-brand-600"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}

          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-4 text-ink-muted">
            Cost of goods only counts products with a cost recorded. Set{" "}
            <Badge>Your cost</Badge> on a product to include it here.
          </p>
        </Card>
      </div>
    </>
  );
}

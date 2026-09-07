import Link from "next/link";
import Image from "next/image";
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  CheckCircle2,
  Users,
  AlertTriangle,
  Star,
  Wallet,
} from "lucide-react";
import {
  getDashboardStats,
  getRevenueSeries,
  getBestSellers,
  getLowStock,
} from "@/lib/queries/admin";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { PageHeader, Card, Badge } from "@/components/ui/primitives";
import { formatTaka, formatTakaCompact } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [stats, series, bestSellers, lowStock] = await Promise.all([
    getDashboardStats(),
    getRevenueSeries(30),
    getBestSellers(6),
    getLowStock(8),
  ]);

  const tiles = [
    {
      label: "Today's sales",
      value: formatTaka(stats.todayRevenuePaisa),
      sub: `${stats.todayOrders} ${stats.todayOrders === 1 ? "order" : "orders"}`,
      icon: TrendingUp,
      tone: "text-brand-600",
    },
    {
      label: "This month",
      value: formatTakaCompact(stats.monthRevenuePaisa),
      sub: `${stats.monthOrders} orders`,
      icon: ShoppingBag,
      tone: "text-brand-600",
    },
    {
      label: "Gross margin (month)",
      value: formatTakaCompact(stats.grossMarginPaisa),
      sub: "Revenue minus cost of goods",
      icon: Wallet,
      tone: "text-success",
    },
    {
      label: "Pending orders",
      value: String(stats.pendingOrders),
      sub: "Placed, confirmed or processing",
      icon: Clock,
      tone: "text-warning",
      href: "/admin/orders?status=placed",
    },
    {
      label: "Delivered",
      value: String(stats.deliveredOrders),
      sub: "All time",
      icon: CheckCircle2,
      tone: "text-success",
    },
    {
      label: "Customers",
      value: String(stats.totalCustomers),
      sub: "Registered accounts",
      icon: Users,
      tone: "text-ink",
      href: "/admin/customers",
    },
    {
      label: "Low stock",
      value: String(stats.lowStockCount),
      sub: "At or below threshold",
      icon: AlertTriangle,
      tone: "text-danger",
      href: "/admin/stock",
    },
    {
      label: "Reviews to moderate",
      value: String(stats.pendingReviews),
      sub: "Awaiting approval",
      icon: Star,
      tone: "text-warning",
      href: "/admin/reviews",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything that changed today, and what needs your attention."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => {
          const body = (
            <Card className="p-4 transition-shadow hover:shadow-lift">
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-ink-muted">{t.label}</p>
                <t.icon size={16} className={t.tone} />
              </div>
              <p className="mt-2 text-2xl font-bold tabular tracking-tight text-ink">
                {t.value}
              </p>
              <p className="mt-0.5 text-xs text-ink-faint">{t.sub}</p>
            </Card>
          );
          return t.href ? (
            <Link key={t.label} href={t.href}>
              {body}
            </Link>
          ) : (
            <div key={t.label}>{body}</div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Revenue — last 30 days</h2>
          <p className="text-xs text-ink-muted">
            Excludes cancelled and returned orders.
          </p>
          <RevenueChart data={series} />
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Best sellers</h2>
            <Link
              href="/admin/reports"
              className="text-xs text-brand-600 hover:text-brand-700"
            >
              Reports
            </Link>
          </div>

          {bestSellers.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">No sales recorded yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {bestSellers.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5">
                  <div className="relative size-9 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken">
                    {p.thumbnail_url ? (
                      <Image
                        src={p.thumbnail_url}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="clamp-2 text-xs font-medium leading-4 text-ink">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-ink-muted tabular">
                      {p.units_sold} sold · {formatTaka(p.price_paisa)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Stock running low</h2>
          <Link
            href="/admin/stock"
            className="text-xs text-brand-600 hover:text-brand-700"
          >
            Manage stock
          </Link>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-125 text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium">SKU</th>
                <th className="pb-2 text-right font-medium">Stock</th>
                <th className="pb-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lowStock.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="clamp-2 font-medium text-ink hover:text-brand-700"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2.5 text-xs text-ink-muted tabular">{p.sku}</td>
                  <td className="py-2.5 text-right tabular">
                    <span
                      className={
                        p.stock === 0
                          ? "font-semibold text-danger"
                          : p.stock <= p.low_stock_threshold
                            ? "font-semibold text-warning"
                            : "text-ink"
                      }
                    >
                      {p.stock}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <Badge
                      tone={
                        p.stock === 0
                          ? "danger"
                          : p.stock <= p.low_stock_threshold
                            ? "warning"
                            : "success"
                      }
                    >
                      {p.stock === 0
                        ? "Out of stock"
                        : p.stock <= p.low_stock_threshold
                          ? "Low"
                          : "OK"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

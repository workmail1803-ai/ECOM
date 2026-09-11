import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone, Mail } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderTimeline } from "@/components/checkout/order-timeline";
import { OrderStatusControl } from "@/components/admin/order-status-control";
import { InternalNote } from "@/components/admin/internal-note";
import { PageHeader, Card, Badge } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";
import type { Order, OrderItem, OrderStatusHistory, Payment } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("orders");
  const db = createAdminClient();

  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle<Order>();

  if (!order) notFound();

  const [{ data: items }, { data: history }, { data: payments }] = await Promise.all([
    db.from("order_items").select("*").eq("order_id", order.id),
    db
      .from("order_status_history")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at"),
    db
      .from("payments")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false }),
  ]);

  const lines = (items as OrderItem[]) ?? [];
  const timeline = (history as OrderStatusHistory[]) ?? [];
  const paymentRows = (payments as Payment[]) ?? [];

  return (
    <>
      <Link
        href="/admin/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={15} />
        All orders
      </Link>

      <PageHeader
        title={order.order_number}
        description={`Placed ${new Date(order.placed_at).toLocaleString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Fulfilment</h2>
            <OrderStatusControl orderId={order.id} status={order.status} />
            <div className="mt-5 border-t border-line pt-5">
              <OrderTimeline status={order.status} history={timeline} />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">
              Items ({lines.reduce((n, l) => n + l.quantity, 0)})
            </h2>
            <ul className="mt-3 divide-y divide-line">
              {lines.map((it) => (
                <li key={it.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken">
                    {it.image_url ? (
                      <Image
                        src={it.image_url}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{it.product_name}</p>
                    {it.variant_name ? (
                      <p className="text-xs text-ink-muted">{it.variant_name}</p>
                    ) : null}
                    <p className="text-xs text-ink-faint tabular">
                      SKU {it.sku} · {it.quantity} × {formatTaka(it.unit_price_paisa)}
                    </p>
                  </div>
                  <span className="tabular text-sm font-semibold text-ink">
                    {formatTaka(it.line_total_paisa)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="tabular">{formatTaka(order.subtotal_paisa)}</dd>
              </div>
              {order.discount_paisa > 0 ? (
                <div className="flex justify-between text-success">
                  <dt>Discount {order.coupon_code ? `(${order.coupon_code})` : ""}</dt>
                  <dd className="tabular">−{formatTaka(order.discount_paisa)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-ink-muted">
                  Delivery · {order.delivery_zone_name}
                </dt>
                <dd className="tabular">{formatTaka(order.delivery_fee_paisa)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular">{formatTaka(order.total_paisa)}</dd>
              </div>
            </dl>
          </Card>

          {paymentRows.length > 0 ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-ink">Payments</h2>
              <ul className="mt-3 divide-y divide-line text-sm">
                {paymentRows.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="font-medium capitalize text-ink">{p.provider}</p>
                      <p className="text-xs text-ink-muted tabular">
                        {p.provider_txn_id ?? p.provider_ref ?? "No gateway reference"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular font-medium">{formatTaka(p.amount_paisa)}</p>
                      <Badge
                        tone={
                          p.status === "successful"
                            ? "success"
                            : p.status === "failed"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {p.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Customer</h2>
            <p className="mt-2 text-sm font-medium text-ink">{order.customer_name}</p>
            <div className="mt-1 space-y-1 text-sm text-ink-muted">
              <a
                href={`tel:${order.customer_phone}`}
                className="flex items-center gap-1.5 hover:text-brand-700"
              >
                <Phone size={13} />
                {order.customer_phone}
              </a>
              {order.customer_email ? (
                <a
                  href={`mailto:${order.customer_email}`}
                  className="flex items-center gap-1.5 hover:text-brand-700"
                >
                  <Mail size={13} />
                  {order.customer_email}
                </a>
              ) : null}
            </div>
            {!order.user_id ? (
              <Badge className="mt-2">Guest checkout</Badge>
            ) : (
              <Link
                href={`/admin/customers?q=${encodeURIComponent(order.customer_phone)}`}
                className="mt-2 inline-block text-xs text-brand-600 hover:text-brand-700"
              >
                View customer →
              </Link>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <MapPin size={14} />
              Ship to
            </h2>
            <address className="mt-2 text-sm not-italic leading-6 text-ink-muted">
              {order.shipping_street}
              <br />
              {order.shipping_area}, {order.shipping_district}
              {order.shipping_postcode ? ` ${order.shipping_postcode}` : ""}
              {order.shipping_landmark ? (
                <>
                  <br />
                  <span className="text-ink-faint">
                    Landmark: {order.shipping_landmark}
                  </span>
                </>
              ) : null}
            </address>
            <p className="mt-2 text-xs text-ink-muted">
              {order.delivery_zone_name} · {order.delivery_min_days}–
              {order.delivery_max_days} days
            </p>
          </Card>

          {order.customer_note ? (
            <Card className="border-warning/25 p-5">
              <h2 className="text-sm font-semibold text-ink">Customer note</h2>
              <p className="mt-1 text-sm text-ink-soft">{order.customer_note}</p>
            </Card>
          ) : null}

          <InternalNote orderId={order.id} note={order.internal_note ?? ""} />
        </div>
      </div>
    </>
  );
}

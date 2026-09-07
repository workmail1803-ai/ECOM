import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OrderTimeline } from "@/components/checkout/order-timeline";
import { CancelOrderButton } from "@/components/account/cancel-order-button";
import { Card, Badge } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";
import type { Order, OrderItem, OrderStatusHistory } from "@/types/database";

export const metadata: Metadata = { title: "Order details", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  // RLS already restricts orders to the owner (or staff); the explicit user_id
  // filter keeps a staff member from landing on a customer's page by accident.
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<Order>();

  if (!order) notFound();

  const [{ data: items }, { data: history }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", order.id),
    supabase
      .from("order_status_history")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at"),
  ]);

  const lines = (items as OrderItem[]) ?? [];
  const timeline = (history as OrderStatusHistory[]) ?? [];
  const cancellable = order.status === "placed" || order.status === "confirmed";

  return (
    <>
      <Link
        href="/account/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={15} />
        All orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tabular tracking-tight text-ink">
            {order.order_number}
          </h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Placed{" "}
            {new Date(order.placed_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <Badge tone={order.payment_status === "successful" ? "success" : "warning"}>
          {order.payment_method === "cod" ? "Cash on delivery" : order.payment_method} ·{" "}
          {order.payment_status}
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Progress</h2>
            <OrderTimeline status={order.status} history={timeline} />
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Items</h2>
            <ul className="mt-3 divide-y divide-line">
              {lines.map((it) => (
                <li key={it.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken">
                    {it.image_url ? (
                      <Image
                        src={it.image_url}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="clamp-2 text-sm font-medium text-ink">
                      {it.product_name}
                    </p>
                    {it.variant_name ? (
                      <p className="text-xs text-ink-muted">{it.variant_name}</p>
                    ) : null}
                    <p className="text-xs text-ink-muted tabular">
                      {it.quantity} × {formatTaka(it.unit_price_paisa)}
                    </p>
                  </div>
                  <span className="tabular text-sm font-medium text-ink">
                    {formatTaka(it.line_total_paisa)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="tabular">{formatTaka(order.subtotal_paisa)}</dd>
              </div>
              {order.discount_paisa > 0 ? (
                <div className="flex justify-between text-success">
                  <dt>{order.coupon_code ?? "Discount"}</dt>
                  <dd className="tabular">−{formatTaka(order.discount_paisa)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-ink-muted">Delivery</dt>
                <dd className="tabular">
                  {order.delivery_fee_paisa === 0
                    ? "Free"
                    : formatTaka(order.delivery_fee_paisa)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular">{formatTaka(order.total_paisa)}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <MapPin size={14} />
              Delivery address
            </h2>
            <address className="mt-2 text-sm not-italic leading-6 text-ink-muted">
              {order.customer_name}
              <br />
              {order.customer_phone}
              <br />
              {order.shipping_street}, {order.shipping_area}
              <br />
              {order.shipping_district}
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
          </Card>

          {order.customer_note ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-ink">Your note</h2>
              <p className="mt-1 text-sm text-ink-muted">{order.customer_note}</p>
            </Card>
          ) : null}

          {cancellable ? <CancelOrderButton orderId={order.id} /> : null}
        </div>
      </div>
    </>
  );
}

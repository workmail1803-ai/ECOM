import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Package, Phone } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreSettings } from "@/lib/queries/settings";
import { formatTaka } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

/**
 * Post-checkout confirmation.
 *
 * Looked up by order NUMBER only, and reached only immediately after checkout,
 * so it deliberately shows nothing sensitive beyond what the customer just
 * typed. Deep tracking lives at /track, which requires the phone number as a
 * second factor.
 */
/** Exactly the columns selected below — the confirmation page needs no more. */
interface ConfirmedOrder {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal_paisa: number;
  discount_paisa: number;
  delivery_fee_paisa: number;
  total_paisa: number;
  delivery_zone_name: string;
  delivery_min_days: number;
  delivery_max_days: number;
  shipping_area: string;
  shipping_district: string;
  placed_at: string;
}

export default async function OrderConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  if (!ref) notFound();

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      "order_number, customer_name, customer_phone, status, payment_method, payment_status, " +
        "subtotal_paisa, discount_paisa, delivery_fee_paisa, total_paisa, " +
        "delivery_zone_name, delivery_min_days, delivery_max_days, " +
        "shipping_area, shipping_district, placed_at",
    )
    .eq("order_number", ref.toUpperCase())
    .maybeSingle<ConfirmedOrder>();

  if (!order) notFound();

  const settings = await getStoreSettings();

  const eta = new Date(order.placed_at);
  eta.setDate(eta.getDate() + order.delivery_max_days);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 size={30} />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
          Thank you, {order.customer_name.split(" ")[0]}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Your order is in. We will call {order.customer_phone} to confirm before
          dispatch.
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-ink-muted">Order number</p>
            <p className="text-lg font-bold tabular text-ink">{order.order_number}</p>
          </div>
          <Badge tone={order.payment_method === "cod" ? "warning" : "success"}>
            {order.payment_method === "cod"
              ? "Cash on delivery"
              : `Paid by ${order.payment_method}`}
          </Badge>
        </div>

        <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd className="tabular text-ink">{formatTaka(order.subtotal_paisa)}</dd>
          </div>
          {order.discount_paisa > 0 ? (
            <div className="flex justify-between">
              <dt className="text-success">Discount</dt>
              <dd className="tabular text-success">
                −{formatTaka(order.discount_paisa)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-ink-muted">Delivery · {order.delivery_zone_name}</dt>
            <dd className="tabular text-ink">
              {order.delivery_fee_paisa === 0
                ? "Free"
                : formatTaka(order.delivery_fee_paisa)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-base">
            <dt className="font-semibold text-ink">
              {order.payment_method === "cod" ? "Pay on delivery" : "Total"}
            </dt>
            <dd className="tabular font-bold text-ink">
              {formatTaka(order.total_paisa)}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-surface-sunken p-3">
          <Package size={17} className="mt-0.5 shrink-0 text-brand-600" />
          <div className="text-sm">
            <p className="font-medium text-ink">
              Arriving by{" "}
              {eta.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <p className="text-ink-muted">
              {order.shipping_area}, {order.shipping_district} ·{" "}
              {order.delivery_min_days}–{order.delivery_max_days} working days
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
        <Button asChild size="lg" variant="outline">
          <Link href={`/track?ref=${order.order_number}`}>Track this order</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/products">Keep shopping</Link>
        </Button>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
        <Phone size={13} />
        Questions? Call {settings.support_phone} · {settings.support_hours}
      </p>
    </div>
  );
}

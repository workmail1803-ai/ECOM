"use client";

import { useActionState } from "react";
import Image from "next/image";
import { PackageSearch } from "lucide-react";
import { trackOrder, type TrackState } from "@/lib/actions/track";
import { OrderTimeline } from "./order-timeline";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";

const initial: TrackState = { ok: false };

export function TrackForm({ defaultRef }: { defaultRef: string }) {
  const [state, action, pending] = useActionState(trackOrder, initial);
  const order = state.order;

  return (
    <>
      <form action={action} className="mt-6 rounded-xl border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Order number" htmlFor="order_number" required>
            <Input
              id="order_number"
              name="order_number"
              required
              defaultValue={defaultRef}
              placeholder="BD-100001"
              className="uppercase"
            />
          </Field>
          <Field label="Mobile number" htmlFor="phone" required>
            <Input
              id="phone"
              name="phone"
              required
              inputMode="numeric"
              placeholder="01XXXXXXXXX"
            />
          </Field>
        </div>

        {state.error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" loading={pending} className="mt-4" block>
          <PackageSearch />
          Track order
        </Button>
      </form>

      {order ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs text-ink-muted">Order</p>
                <p className="text-lg font-bold tabular text-ink">
                  {order.order_number}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Placed{" "}
                  {new Date(order.placed_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <Badge
                tone={
                  order.payment_status === "successful"
                    ? "success"
                    : order.payment_method === "cod"
                      ? "warning"
                      : "neutral"
                }
              >
                {order.payment_method === "cod"
                  ? "Cash on delivery"
                  : order.payment_method}{" "}
                · {order.payment_status}
              </Badge>
            </div>

            <div className="mt-5 border-t border-line pt-5">
              <OrderTimeline status={order.status} history={order.history} />
            </div>

            <p className="mt-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
              Delivering to {order.shipping_area}, {order.shipping_district} ·{" "}
              {order.delivery_zone_name} ({order.delivery_min_days}–
              {order.delivery_max_days} days)
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">Items</h2>
            <ul className="mt-3 divide-y divide-line">
              {order.items.map((it, i) => (
                <li key={i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
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

            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="tabular">{formatTaka(order.subtotal_paisa)}</dd>
              </div>
              {order.discount_paisa > 0 ? (
                <div className="flex justify-between text-success">
                  <dt>Discount</dt>
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
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{formatTaka(order.total_paisa)}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}
    </>
  );
}

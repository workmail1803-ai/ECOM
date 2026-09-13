"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Tag, X, AlertTriangle, ArrowRight } from "lucide-react";
import type { CartQuote } from "@/lib/pricing/types";
import { COUPON_ERROR_MESSAGE, LINE_ISSUE_MESSAGE } from "@/lib/pricing/types";
import {
  setCartQuantity,
  removeCartItem,
  applyCoupon,
  type CartActionResult,
} from "@/lib/actions/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";
import { DeliveryPicker } from "./delivery-picker";
import type { DeliveryOption } from "@/components/checkout/delivery-options";

/**
 * The cart.
 *
 * Every number rendered comes from `quote`, which is produced by `quote_cart()`
 * in Postgres. This component never adds anything up — not the line totals, not
 * the subtotal, not the discount. When a mutation returns, it swaps in the
 * fresh quote wholesale.
 */
export function CartView({
  initialQuote,
  deliveryOptions,
}: {
  initialQuote: CartQuote;
  deliveryOptions: DeliveryOption[];
}) {
  const [quote, setQuote] = useState(initialQuote);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [couponPending, startCoupon] = useTransition();
  const router = useRouter();

  function handle(result: CartActionResult) {
    if (!result.ok) {
      toast.error(result.error ?? "Something went wrong.");
      return;
    }
    if (result.notice) toast.warning(result.notice);
    setQuote(result.quote);
    router.refresh();
  }

  async function changeQty(cartItemId: string, quantity: number) {
    setPendingId(cartItemId);
    handle(await setCartQuantity(cartItemId, quantity));
    setPendingId(null);
  }

  async function remove(cartItemId: string) {
    setPendingId(cartItemId);
    handle(await removeCartItem(cartItemId));
    setPendingId(null);
  }

  function submitCoupon(value: string) {
    startCoupon(async () => {
      const result = await applyCoupon(value);
      if (!result.ok) {
        toast.error(result.error ?? "Could not apply that coupon.");
        return;
      }
      setQuote(result.quote);
      if (result.quote.coupon_error) {
        toast.error(COUPON_ERROR_MESSAGE[result.quote.coupon_error]);
      } else if (result.quote.coupon) {
        toast.success(`Coupon ${result.quote.coupon.code} applied.`);
        setCode("");
      } else {
        toast.success("Coupon removed.");
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {quote.lines.map((line) => {
          const busy = pendingId === line.cart_item_id;
          const maxQty = Math.min(line.available_stock, 99);

          return (
            <li
              key={line.cart_item_id}
              className={`flex gap-3 p-4 ${busy ? "opacity-60" : ""}`}
            >
              <Link
                href={`/products/${line.product_slug}`}
                className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken sm:size-24"
              >
                {line.image_url ? (
                  <Image
                    src={line.image_url}
                    alt={line.product_name}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : null}
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/products/${line.product_slug}`}
                      className="clamp-2 text-sm font-medium text-ink hover:text-brand-700"
                    >
                      {line.product_name}
                    </Link>
                    {line.variant_name ? (
                      <p className="mt-0.5 text-xs text-ink-muted">{line.variant_name}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="tabular text-sm text-ink-soft">
                        {formatTaka(line.unit_price_paisa)}
                      </span>
                      {line.compare_at_paisa ? (
                        <span className="tabular text-xs text-ink-faint line-through">
                          {formatTaka(line.compare_at_paisa)}
                        </span>
                      ) : null}
                      {line.is_flash_sale ? <Badge tone="sale">Flash sale</Badge> : null}
                    </div>
                  </div>

                  <span className="tabular shrink-0 text-sm font-semibold text-ink">
                    {formatTaka(line.line_total_paisa)}
                  </span>
                </div>

                {line.issue ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-danger">
                    <AlertTriangle size={13} />
                    {LINE_ISSUE_MESSAGE[line.issue]}
                    {line.issue === "insufficient_stock"
                      ? ` — only ${line.available_stock} available`
                      : ""}
                  </p>
                ) : null}

                <div className="mt-2.5 flex items-center justify-between">
                  <div className="flex items-center rounded-lg border border-line-strong">
                    <button
                      onClick={() => changeQty(line.cart_item_id, line.quantity - 1)}
                      disabled={busy || line.quantity <= 1}
                      className="inline-flex size-8 items-center justify-center text-ink-soft disabled:opacity-30 enabled:hover:bg-surface-sunken"
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-9 text-center text-sm font-medium tabular">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => changeQty(line.cart_item_id, line.quantity + 1)}
                      disabled={busy || line.quantity >= maxQty}
                      className="inline-flex size-8 items-center justify-center text-ink-soft disabled:opacity-30 enabled:hover:bg-surface-sunken"
                      aria-label="Increase quantity"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <button
                    onClick={() => remove(line.cart_item_id)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="lg:sticky lg:top-32 lg:h-fit">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">Order summary</h2>

          <div className="mt-4">
            {quote.coupon ? (
              <div className="flex items-center justify-between rounded-lg border border-success/20 bg-success-soft px-3 py-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                  <Tag size={14} />
                  {quote.coupon.code}
                </span>
                <button
                  onClick={() => submitCoupon("")}
                  disabled={couponPending}
                  className="text-success/70 hover:text-success"
                  aria-label="Remove coupon"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.trim()) submitCoupon(code.trim());
                }}
                className="flex gap-2"
              >
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Coupon code"
                  aria-label="Coupon code"
                  className="h-9 text-sm uppercase"
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  loading={couponPending}
                  disabled={!code.trim()}
                >
                  Apply
                </Button>
              </form>
            )}
            {quote.coupon_error ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {COUPON_ERROR_MESSAGE[quote.coupon_error]}
              </p>
            ) : null}
          </div>

          <dl className="mt-5 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="tabular font-medium text-ink">
                {formatTaka(quote.subtotal_paisa)}
              </dd>
            </div>

            {quote.discount_paisa > 0 ? (
              <div className="flex justify-between">
                <dt className="text-success">Discount</dt>
                <dd className="tabular font-medium text-success">
                  −{formatTaka(quote.discount_paisa)}
                </dd>
              </div>
            ) : null}

            <div className="flex justify-between">
              <dt className="text-ink-muted">Delivery</dt>
              <dd className="tabular text-ink-muted">
                {quote.delivery_fee_paisa > 0
                  ? formatTaka(quote.delivery_fee_paisa)
                  : "Check below"}
              </dd>
            </div>

            <div className="flex justify-between border-t border-line pt-3 text-base">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="tabular font-bold text-ink">
                {formatTaka(quote.total_paisa)}
              </dd>
            </div>
          </dl>

          <DeliveryPicker options={deliveryOptions} />

          {quote.has_blocking_issue ? (
            <p className="mt-4 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              Fix the flagged items above before checking out.
            </p>
          ) : null}

          <Button
            asChild={!quote.has_blocking_issue}
            disabled={quote.has_blocking_issue}
            size="lg"
            block
            className="mt-4"
          >
            {quote.has_blocking_issue ? (
              <>Proceed to checkout</>
            ) : (
              <Link href="/checkout">
                Proceed to checkout
                <ArrowRight />
              </Link>
            )}
          </Button>

          <Link
            href="/products"
            className="mt-3 block text-center text-sm text-brand-600 hover:text-brand-700"
          >
            Continue shopping
          </Link>
        </div>
      </aside>
    </div>
  );
}

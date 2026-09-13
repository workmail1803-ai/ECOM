"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import * as Icons from "lucide-react";
import { Truck, Tag, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Address } from "@/types/database";
import type { CartQuote } from "@/lib/pricing/types";
import type { PaymentOption } from "@/lib/payments";
import { placeOrder, type CheckoutState } from "@/lib/actions/checkout";
import { quoteForDistrict } from "@/lib/actions/cart";
import { BD_DISTRICTS } from "@/lib/utils/districts";
import { formatTaka } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/field";
import { cn } from "@/lib/utils/cn";
import {
  etaLabel,
  styleFor,
  type DeliveryOption,
} from "@/components/checkout/delivery-options";

const initial: CheckoutState = { ok: false };

/**
 * Checkout.
 *
 * The form posts ids, names and an address. It does NOT post a price — read the
 * hidden inputs: there are none for money. `place_order()` re-quotes the cart
 * server-side and writes its own subtotal, discount, delivery fee and total.
 *
 * The figures rendered on the right are a live `quote_cart()` result refreshed
 * whenever the district changes, so the customer sees the real delivery charge
 * before committing — but that quote is display, not input.
 */
export function CheckoutForm({
  initialQuote,
  addresses,
  paymentOptions,
  signedIn,
  defaultName,
  defaultPhone,
  defaultEmail,
  codAdvanceThresholdPaisa,
  deliveryOptions,
  showroomAddress,
}: {
  initialQuote: CartQuote;
  addresses: Address[];
  paymentOptions: PaymentOption[];
  signedIn: boolean;
  defaultName: string;
  defaultPhone: string;
  defaultEmail: string;
  codAdvanceThresholdPaisa: number;
  deliveryOptions: DeliveryOption[];
  /** Used as the address of record when the customer collects in person. */
  showroomAddress: string;
}) {
  const [state, action, pending] = useActionState(placeOrder, initial);

  const preset = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;
  const [addressId, setAddressId] = useState<string>(preset?.id ?? "");
  /*
   * The 64-district dropdown is gone. Delivery is three options, and the only
   * one that still needs a place name typed is Outside Dhaka — the other two
   * are fully determined by the choice itself.
   */
  const [zoneSlug, setZoneSlug] = useState<string>(
    preset?.district === "Dhaka" ? "inside-dhaka" : deliveryOptions[0]?.slug ?? "",
  );
  const [outsideCity, setOutsideCity] = useState(
    preset && preset.district !== "Dhaka" ? preset.district : "",
  );

  // What actually goes to the server as `district`, and what the zone
  // resolver matches on.
  const district =
    zoneSlug === "office-pickup"
      ? "Office Pickup"
      : zoneSlug === "inside-dhaka"
        ? "Dhaka"
        : outsideCity.trim();

  const isPickup = zoneSlug === "office-pickup";
  const [quote, setQuote] = useState(initialQuote);
  const [method, setMethod] = useState<string>(paymentOptions[0]?.id ?? "cod");
  const [, startQuote] = useTransition();

  // Re-quote whenever the district changes so the delivery fee is real.
  useEffect(() => {
    if (!district) return;
    startQuote(async () => {
      // The payment method is included because delivery is discounted on
      // prepaid; quoting without it would show a cash-on-delivery fee to
      // someone who has already chosen bKash.
      const next = await quoteForDistrict(district, method as never);
      if (next.cart_id) setQuote(next);
    });
  }, [district, method]);

  const usingSaved = Boolean(addressId);
  const saved = addresses.find((a) => a.id === addressId) ?? null;
  const codBlocked =
    method === "cod" && quote.total_paisa > codAdvanceThresholdPaisa;

  return (
    <form action={action} className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {addresses.length > 0 ? (
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-base font-semibold text-ink">Deliver to</h2>
            <div className="mt-3 space-y-2">
              {addresses.map((a) => (
                <label
                  key={a.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                    addressId === a.id
                      ? "border-brand-600 bg-brand-50"
                      : "border-line hover:border-line-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="address_choice"
                    checked={addressId === a.id}
                    onChange={() => {
                      setAddressId(a.id);
                      // A saved address is either Dhaka or it is not; there is
                      // no third case now that pricing has three options.
                      if (a.district === "Dhaka") {
                        setZoneSlug("inside-dhaka");
                      } else {
                        setZoneSlug("outside-dhaka");
                        setOutsideCity(a.district);
                      }
                    }}
                    className="mt-1 accent-brand-600"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-ink">
                      {a.recipient_name} · {a.phone}
                    </span>
                    <span className="mt-0.5 block text-ink-muted">
                      {a.street}, {a.area}, {a.district}
                      {a.postcode ? ` ${a.postcode}` : ""}
                    </span>
                  </span>
                </label>
              ))}

              <label
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                  !addressId ? "border-brand-600 bg-brand-50" : "border-line",
                )}
              >
                <input
                  type="radio"
                  name="address_choice"
                  checked={!addressId}
                  onChange={() => {
                    setAddressId("");
                  }}
                  className="mt-1 accent-brand-600"
                />
                <span className="text-sm font-medium text-ink">
                  Use a different address
                </span>
              </label>
            </div>
          </section>
        ) : null}

        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">
            {usingSaved ? "Contact details" : "Delivery details"}
          </h2>

          {/* Saved address: the values still post, but as read-only fields. */}
          <input type="hidden" name="address_id" value={addressId} />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Full name"
              htmlFor="customer_name"
              required
              error={state.fieldErrors?.customer_name}
            >
              <Input
                id="customer_name"
                name="customer_name"
                required
                autoComplete="name"
                defaultValue={saved?.recipient_name ?? defaultName}
                key={`name-${addressId}`}
                placeholder="Recipient's full name"
                invalid={Boolean(state.fieldErrors?.customer_name)}
              />
            </Field>

            <Field
              label="Mobile number"
              htmlFor="customer_phone"
              required
              hint="We send delivery updates to this number"
              error={state.fieldErrors?.customer_phone}
            >
              <Input
                id="customer_phone"
                name="customer_phone"
                required
                inputMode="numeric"
                autoComplete="tel"
                defaultValue={saved?.phone ?? defaultPhone}
                key={`phone-${addressId}`}
                placeholder="01XXXXXXXXX"
                invalid={Boolean(state.fieldErrors?.customer_phone)}
              />
            </Field>

            <Field
              label="Email"
              htmlFor="customer_email"
              hint="Optional — for your invoice"
              error={state.fieldErrors?.customer_email}
              className="sm:col-span-2"
            >
              <Input
                id="customer_email"
                name="customer_email"
                type="email"
                autoComplete="email"
                defaultValue={defaultEmail}
                placeholder="you@example.com"
              />
            </Field>

            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium text-ink">
                Delivery <span className="text-danger">*</span>
              </p>

              <div className="grid gap-2 sm:grid-cols-3">
                {deliveryOptions.map((o) => {
                  const st = styleFor(o.slug);
                  const Icon = st.icon;
                  const active = zoneSlug === o.slug;

                  return (
                    <button
                      key={o.slug}
                      type="button"
                      onClick={() => setZoneSlug(o.slug)}
                      aria-pressed={active}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        active
                          ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600/20"
                          : "border-line bg-surface hover:border-line-strong"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg ${st.tint} ${st.text}`}
                        >
                          <Icon size={15} />
                        </span>
                        <span className="text-sm font-semibold text-ink">
                          {o.name}
                        </span>
                      </span>
                      <span
                        className={`mt-2 block text-lg font-bold tabular tracking-tight ${
                          o.feePaisa === 0 ? "text-success" : "text-ink"
                        }`}
                      >
                        {o.feePaisa === 0 ? "Free" : formatTaka(o.feePaisa)}
                      </span>
                      <span className="block text-[11px] text-ink-muted">
                        {etaLabel(o)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* The server still receives a district; the choice above just
                  decides what it is, instead of making the customer find
                  their own in a list of 64. */}
              <input type="hidden" name="district" value={district} />

              {state.fieldErrors?.district ? (
                <p role="alert" className="mt-1.5 text-xs text-danger">
                  {state.fieldErrors.district}
                </p>
              ) : null}

              {zoneSlug === "outside-dhaka" ? (
                <div className="mt-3">
                  <label
                    htmlFor="outside-city"
                    className="mb-1 block text-sm font-medium text-ink"
                  >
                    Your city or district <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="outside-city"
                    required
                    value={outsideCity}
                    onChange={(e) => setOutsideCity(e.target.value)}
                    placeholder="e.g. Sylhet"
                    invalid={Boolean(state.fieldErrors?.district)}
                  />
                  <p className="mt-1 text-xs text-ink-muted">
                    The charge is the same anywhere outside Dhaka — this is only
                    so the courier knows where to go.
                  </p>
                </div>
              ) : null}

              {isPickup ? (
                <p className="mt-3 rounded-lg border border-success/20 bg-success-soft px-3 py-2 text-xs leading-5 text-success">
                  Collect from {showroomAddress}. We will call you when it is
                  ready — no delivery address needed.
                </p>
              ) : null}
            </div>

            {/*
              A collection needs no delivery address, and leaving four required
              address fields on screen next to "no delivery address needed"
              would be a contradiction the customer has to resolve. The server
              schema still requires area and street, so the showroom is
              submitted as the address of record — which is also the truthful
              answer to "where did this order go".
            */}
            {isPickup ? (
              <>
                <input type="hidden" name="area" value="Office Pickup" />
                <input type="hidden" name="street" value={showroomAddress} />
              </>
            ) : (
              <>
            <Field
              label="Area / thana"
              htmlFor="area"
              required
              error={state.fieldErrors?.area}
            >
              <Input
                id="area"
                name="area"
                required
                defaultValue={saved?.area ?? ""}
                key={`area-${addressId}`}
                placeholder="e.g. Dhanmondi"
                invalid={Boolean(state.fieldErrors?.area)}
              />
            </Field>

            <Field
              label="House & road"
              htmlFor="street"
              required
              className="sm:col-span-2"
              error={state.fieldErrors?.street}
            >
              <Input
                id="street"
                name="street"
                required
                defaultValue={saved?.street ?? ""}
                key={`street-${addressId}`}
                placeholder="House 12, Road 5, Block C"
                invalid={Boolean(state.fieldErrors?.street)}
              />
            </Field>

            <Field label="Postcode" htmlFor="postcode">
              <Input
                id="postcode"
                name="postcode"
                defaultValue={saved?.postcode ?? ""}
                key={`post-${addressId}`}
                placeholder="1205"
              />
            </Field>

            <Field label="Landmark" htmlFor="landmark" hint="Helps the courier find you">
              <Input
                id="landmark"
                name="landmark"
                defaultValue={saved?.landmark ?? ""}
                key={`land-${addressId}`}
                placeholder="Beside the mosque"
              />
            </Field>
              </>
            )}

            <Field
              label="Order note"
              htmlFor="customer_note"
              className="sm:col-span-2"
              hint="Anything the packer or courier should know"
            >
              <Textarea
                id="customer_note"
                name="customer_note"
                rows={2}
                maxLength={500}
                placeholder="Call before delivery, please."
              />
            </Field>
          </div>

          {signedIn && !usingSaved ? (
            <label className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                name="save_address"
                className="size-4 accent-brand-600"
              />
              Save this address for next time
            </label>
          ) : null}
        </section>

        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">Payment method</h2>

          <div className="mt-3 space-y-2">
            {paymentOptions.map((o) => {
              const Icon =
                ((Icons as unknown as Record<string, LucideIcon>)[o.icon]) ??
                Icons.CreditCard;
              return (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                    method === o.id
                      ? "border-brand-600 bg-brand-50"
                      : "border-line hover:border-line-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="payment_method"
                    value={o.id}
                    checked={method === o.id}
                    onChange={() => setMethod(o.id)}
                    className="mt-1 accent-brand-600"
                    required
                  />
                  <Icon size={18} className="mt-0.5 shrink-0 text-ink-soft" />
                  <span className="text-sm">
                    <span className="font-medium text-ink">{o.label}</span>
                    <span className="mt-0.5 block text-ink-muted">{o.description}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {codBlocked ? (
            <p className="mt-3 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
              Orders above {formatTaka(codAdvanceThresholdPaisa)} need an advance
              payment before dispatch. Place the order and our team will call you to
              arrange it.
            </p>
          ) : null}

          {paymentOptions.length === 1 && paymentOptions[0]?.id === "cod" ? (
            <p className="mt-3 text-xs text-ink-muted">
              Online payment options appear here once bKash, Nagad or card
              credentials are configured.
            </p>
          ) : null}
        </section>
      </div>

      <aside className="lg:sticky lg:top-32 lg:h-fit">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">Order summary</h2>

          <ul className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">
            {quote.lines.map((l) => (
              <li key={l.cart_item_id} className="flex gap-3">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken">
                  {l.image_url ? (
                    <Image
                      src={l.image_url}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : null}
                  <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white tabular">
                    {l.quantity}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="clamp-2 text-xs font-medium leading-4 text-ink">
                    {l.product_name}
                  </p>
                  {l.variant_name ? (
                    <p className="text-[11px] text-ink-muted">{l.variant_name}</p>
                  ) : null}
                </div>
                <span className="tabular shrink-0 text-xs font-medium text-ink">
                  {formatTaka(l.line_total_paisa)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="tabular font-medium text-ink">
                {formatTaka(quote.subtotal_paisa)}
              </dd>
            </div>

            {quote.discount_paisa > 0 ? (
              <div className="flex justify-between">
                <dt className="flex items-center gap-1 text-success">
                  <Tag size={13} />
                  {quote.coupon?.code ?? "Discount"}
                </dt>
                <dd className="tabular font-medium text-success">
                  −{formatTaka(quote.discount_paisa)}
                </dd>
              </div>
            ) : null}

            <div className="flex justify-between">
              <dt className="flex items-center gap-1 text-ink-muted">
                <Truck size={13} />
                Delivery
              </dt>
              <dd className="tabular font-medium text-ink">
                {!district ? (
                  <span className="text-ink-faint">Select a district</span>
                ) : quote.delivery_fee_paisa === 0 ? (
                  <span className="text-success">Free</span>
                ) : (
                  formatTaka(quote.delivery_fee_paisa)
                )}
              </dd>
            </div>

            {quote.delivery_zone ? (
              <p className="text-xs text-ink-muted">
                {quote.delivery_zone.name} · {quote.delivery_zone.min_days}–
                {quote.delivery_zone.max_days} days
              </p>
            ) : null}

            <div className="flex justify-between border-t border-line pt-3 text-base">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="tabular font-bold text-ink">
                {formatTaka(quote.total_paisa)}
              </dd>
            </div>
          </dl>

          {state.error ? (
            <p role="alert" className="mt-4 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
              {state.error}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            block
            loading={pending}
            disabled={!district}
            className="mt-4"
          >
            Place order
          </Button>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-4 text-ink-muted">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-success" />
            Your total is calculated on our server from live prices — it cannot be
            changed from your browser.
          </p>

          {!signedIn ? (
            <p className="mt-2 text-[11px] text-ink-muted">
              Checking out as a guest.{" "}
              <Link href="/sign-in?next=/checkout" className="text-brand-600">
                Sign in
              </Link>{" "}
              to save your address and track orders.
            </p>
          ) : null}
        </div>
      </aside>
    </form>
  );
}

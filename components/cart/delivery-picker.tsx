"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { quoteByPaymentMethod } from "@/lib/actions/cart";
import {
  etaLabel,
  styleFor,
  type DeliveryOption,
} from "@/components/checkout/delivery-options";
import { formatTaka } from "@/lib/utils/money";
import type { PaymentMethod } from "@/types/database";

const LABEL: Record<string, string> = {
  cod: "Cash on delivery",
  bkash: "bKash",
  nagad: "Nagad",
  card: "Card",
  other: "Other",
};

interface Row {
  method: PaymentMethod;
  label: string;
  deliveryPaisa: number;
  totalPaisa: number;
}

/**
 * Delivery choice in the cart: three cards, no district lookup.
 *
 * This replaces a 64-entry district dropdown. Finding "Jhalokathi" in an
 * alphabetical list is not a decision anyone wants to make to find out what
 * postage costs — and the honest answer only ever had three values anyway.
 *
 * Picking an option re-quotes every enabled payment method for it, so the
 * shopper sees both choices priced together. Every figure is a real
 * `quote_cart()` result; nothing here does arithmetic on money.
 */
export function DeliveryPicker({ options }: { options: DeliveryOption[] }) {
  const [selected, setSelected] = useState<DeliveryOption | null>(
    options[0] ?? null,
  );
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!selected) return;
    start(async () => {
      // The zone resolver matches on district, and each option's district key
      // is what selects it — "Office Pickup", "Dhaka", or anything else, which
      // falls through to Outside Dhaka.
      const key =
        selected.slug === "office-pickup"
          ? "Office Pickup"
          : selected.slug === "inside-dhaka"
            ? "Dhaka"
            : "Outside Dhaka";

      const results = await quoteByPaymentMethod(key);
      setRows(
        results.map(({ method, quote }) => ({
          method,
          label: LABEL[method] ?? method,
          deliveryPaisa: quote.delivery_fee_paisa,
          totalPaisa: quote.total_paisa,
        })),
      );
    });
  }, [selected]);

  const cheapest = rows?.length
    ? rows.reduce((a, b) => (b.totalPaisa < a.totalPaisa ? b : a))
    : null;
  const dearest = rows?.length
    ? rows.reduce((a, b) => (b.totalPaisa > a.totalPaisa ? b : a))
    : null;
  const saving = cheapest && dearest ? dearest.totalPaisa - cheapest.totalPaisa : 0;

  if (options.length === 0) return null;

  return (
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Delivery
      </p>

      <div className="mt-2 space-y-2">
        {options.map((o) => {
          const s = styleFor(o.slug);
          const Icon = s.icon;
          const active = selected?.slug === o.slug;

          return (
            <button
              key={o.slug}
              type="button"
              onClick={() => setSelected(o)}
              aria-pressed={active}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                active
                  ? "border-brand-600 bg-brand-50"
                  : "border-line bg-surface hover:border-line-strong"
              }`}
            >
              <span
                className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${s.tint} ${s.text}`}
              >
                <Icon size={16} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">
                  {o.name}
                </span>
                <span className="block text-[11px] text-ink-muted">
                  {etaLabel(o)}
                </span>
              </span>

              <span
                className={`shrink-0 text-sm font-bold tabular ${
                  o.feePaisa === 0 ? "text-success" : "text-ink"
                }`}
              >
                {o.feePaisa === 0 ? "Free" : formatTaka(o.feePaisa)}
              </span>

              <span
                className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  active ? "border-brand-600 bg-brand-600" : "border-line-strong"
                }`}
                aria-hidden
              >
                {active ? <Check size={11} className="text-white" /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-xl border border-line bg-surface-sunken/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Total by payment method
        </p>

        {pending || !rows ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
            <Loader2 size={13} className="animate-spin" />
            Pricing…
          </p>
        ) : (
          <>
            <ul className="mt-1.5 space-y-0.5">
              {rows.map((r) => {
                const best = cheapest?.method === r.method && saving > 0;
                return (
                  <li
                    key={r.method}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs ${
                      best ? "bg-success-soft" : ""
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-ink-soft">
                      {best ? (
                        <Check size={12} className="shrink-0 text-success" />
                      ) : (
                        <span className="w-3" aria-hidden />
                      )}
                      {r.label}
                    </span>
                    <span className="font-semibold tabular text-ink">
                      {formatTaka(r.totalPaisa)}
                    </span>
                  </li>
                );
              })}
            </ul>

            {saving > 0 && cheapest ? (
              <p className="mt-1.5 px-2 text-[11px] leading-4 text-success">
                Paying with {cheapest.label} saves {formatTaka(saving)}.
              </p>
            ) : null}
          </>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-4 text-ink-faint">
        You confirm delivery and payment at checkout.
      </p>
    </div>
  );
}

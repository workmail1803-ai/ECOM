"use client";

import { useState, useTransition } from "react";
import { Truck, Check, Loader2 } from "lucide-react";
import { quoteByPaymentMethod } from "@/lib/actions/cart";
import { BD_DISTRICTS } from "@/lib/utils/districts";
import { formatTaka } from "@/lib/utils/money";
import type { PaymentMethod } from "@/types/database";

interface Row {
  method: PaymentMethod;
  label: string;
  deliveryPaisa: number;
  totalPaisa: number;
}

const LABEL: Record<string, string> = {
  cod: "Cash on delivery",
  bkash: "bKash",
  nagad: "Nagad",
  card: "Card",
  other: "Other",
};

/**
 * Delivery cost, in the cart, before checkout.
 *
 * The cart used to say "Delivery — calculated at checkout", which means the
 * shopper only learns the real total after filling in an address form. Worse,
 * they never find out that paying with bKash is cheaper than cash on delivery,
 * because that only emerges on the last step.
 *
 * Pick a district here and every enabled payment method is priced at once, so
 * the trade-off is visible while there is still something to decide. Each
 * figure is a real `quote_cart()` result — this component does no arithmetic
 * on money, it only lays the answers out.
 */
export function DeliveryEstimator({ subtotalPaisa }: { subtotalPaisa: number }) {
  const [district, setDistrict] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, start] = useTransition();

  const onPick = (value: string) => {
    setDistrict(value);
    setRows(null);
    if (!value) return;

    start(async () => {
      const results = await quoteByPaymentMethod(value);
      setRows(
        results.map(({ method, quote }) => ({
          method,
          label: LABEL[method] ?? method,
          deliveryPaisa: quote.delivery_fee_paisa,
          totalPaisa: quote.total_paisa,
        })),
      );
    });
  };

  // The cheapest option, so the saving can be stated as a number rather than
  // left for the shopper to work out by comparing rows.
  const cheapest = rows?.length
    ? rows.reduce((a, b) => (b.totalPaisa < a.totalPaisa ? b : a))
    : null;
  const dearest = rows?.length
    ? rows.reduce((a, b) => (b.totalPaisa > a.totalPaisa ? b : a))
    : null;
  const saving =
    cheapest && dearest ? dearest.totalPaisa - cheapest.totalPaisa : 0;

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface-sunken/60 p-3">
      <div className="flex items-center gap-2">
        <Truck size={15} className="shrink-0 text-brand-600" />
        <span className="text-xs font-semibold text-ink">
          Check delivery cost
        </span>
      </div>

      <label className="mt-2 block">
        <span className="sr-only">Delivery district</span>
        <select
          value={district}
          onChange={(e) => onPick(e.target.value)}
          className="h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-sm focus:border-brand-600 focus:outline-none"
        >
          <option value="">Select your district…</option>
          {BD_DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      {pending ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-muted">
          <Loader2 size={13} className="animate-spin" />
          Checking rates…
        </p>
      ) : null}

      {rows && !pending ? (
        <>
          <ul className="mt-2.5 space-y-1">
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
                      <Check size={13} className="shrink-0 text-success" />
                    ) : (
                      <span className="w-[13px]" aria-hidden />
                    )}
                    {r.label}
                  </span>
                  <span className="flex items-center gap-2 tabular">
                    <span className={r.deliveryPaisa === 0 ? "text-success" : "text-ink-muted"}>
                      {r.deliveryPaisa === 0 ? "Free" : formatTaka(r.deliveryPaisa)}
                    </span>
                    <span className="font-semibold text-ink">
                      {formatTaka(r.totalPaisa)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {saving > 0 && cheapest ? (
            <p className="mt-2 text-[11px] leading-4 text-success">
              Paying with {cheapest.label} saves you {formatTaka(saving)} on this
              order.
            </p>
          ) : null}

          <p className="mt-1.5 text-[11px] leading-4 text-ink-faint">
            Totals include delivery to {district}. You confirm the method at
            checkout.
          </p>
        </>
      ) : null}

      {!rows && !pending && subtotalPaisa > 0 ? (
        <p className="mt-2 text-[11px] leading-4 text-ink-faint">
          See the exact delivery charge and total for every payment method
          before you check out.
        </p>
      ) : null}
    </div>
  );
}

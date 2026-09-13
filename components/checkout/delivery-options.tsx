import { Store, MapPin, Truck } from "lucide-react";
import { formatTaka } from "@/lib/utils/money";

/**
 * The three delivery options, as cards.
 *
 * One definition, three places: the product page shows it read-only, the cart
 * and the checkout make it selectable. Keeping the presentation here is what
 * stops the price on the product page drifting from the price at checkout.
 *
 * Zones come from the database, so an operator can re-price them at
 * /admin/settings without a deploy. Only the icon and accent are chosen here,
 * keyed by slug, with a neutral default so a zone added later still renders.
 */

export interface DeliveryOption {
  slug: string;
  name: string;
  feePaisa: number;
  minDays: number;
  maxDays: number;
}

const STYLE: Record<
  string,
  { icon: typeof Store; ring: string; tint: string; text: string }
> = {
  "office-pickup": {
    icon: Store,
    ring: "ring-success/25",
    tint: "bg-success-soft",
    text: "text-success",
  },
  "inside-dhaka": {
    icon: MapPin,
    ring: "ring-brand-600/25",
    tint: "bg-brand-50",
    text: "text-brand-600",
  },
  "outside-dhaka": {
    icon: Truck,
    ring: "ring-ink/15",
    tint: "bg-surface-sunken",
    text: "text-ink",
  },
};

const FALLBACK_STYLE = {
  icon: Truck,
  ring: "ring-ink/15",
  tint: "bg-surface-sunken",
  text: "text-ink",
};

/** "Same day" reads better than "1–1 days" for a counter collection. */
export function etaLabel(o: DeliveryOption): string {
  if (o.slug === "office-pickup") return "Collect same day";
  if (o.minDays === o.maxDays) return `${o.minDays} business day`;
  return `${o.minDays}–${o.maxDays} business days`;
}

export function styleFor(slug: string) {
  return STYLE[slug] ?? FALLBACK_STYLE;
}

/** Read-only display, for the product page. */
export function DeliveryOptionCards({ options }: { options: DeliveryOption[] }) {
  if (options.length === 0) return null;

  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      {options.map((o) => {
        const s = styleFor(o.slug);
        const Icon = s.icon;

        return (
          <div
            key={o.slug}
            className={`rounded-xl bg-surface p-3.5 ring-1 ${s.ring} transition-shadow hover:shadow-card`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg ${s.tint} ${s.text}`}
              >
                <Icon size={15} />
              </span>
              <span className="text-sm font-semibold text-ink">{o.name}</span>
            </div>

            <p
              className={`mt-2 text-xl font-bold tabular tracking-tight ${
                o.feePaisa === 0 ? "text-success" : "text-ink"
              }`}
            >
              {o.feePaisa === 0 ? "Free" : formatTaka(o.feePaisa)}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">{etaLabel(o)}</p>
          </div>
        );
      })}
    </div>
  );
}

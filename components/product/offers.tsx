import Link from "next/link";
import Image from "next/image";
import { Layers, TrendingDown } from "lucide-react";
import type { BundleOffer, QuantityBreak } from "@/lib/queries/promotions";
import { formatTaka } from "@/lib/utils/money";

/**
 * Offers on the product page.
 *
 * Advertised here because volume and bundle discounts only change a decision
 * if the shopper learns about them BEFORE choosing a quantity. Every figure is
 * re-derived by quote_cart when the item reaches the cart; these are the same
 * rules read for display.
 */
export function ProductOffers({
  breaks,
  bundles,
  unitPricePaisa,
  productId,
}: {
  breaks: QuantityBreak[];
  bundles: BundleOffer[];
  unitPricePaisa: number;
  productId: string;
}) {
  if (breaks.length === 0 && bundles.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      {breaks.length > 0 ? (
        <div className="rounded-xl border border-success/20 bg-success-soft/50 p-4">
          <div className="flex items-center gap-2">
            <TrendingDown size={16} className="shrink-0 text-success" />
            <h3 className="text-sm font-semibold text-ink">Buy more, save more</h3>
          </div>

          <ul className="mt-2.5 space-y-1.5">
            {breaks.map((b) => {
              const each = Math.round(unitPricePaisa * (1 - b.discountPercent / 100));
              return (
                <li
                  key={b.minQuantity}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-ink-soft">
                    Buy {b.minQuantity} or more
                  </span>
                  <span className="tabular">
                    <span className="font-semibold text-success">
                      {formatTaka(each)}
                    </span>
                    <span className="text-xs text-ink-muted"> each</span>
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="mt-2 text-[11px] leading-4 text-ink-faint">
            Applied automatically in the cart. No code needed.
          </p>
        </div>
      ) : null}

      {bundles.map((bundle) => {
        const full = bundle.products.reduce((sum, p) => sum + p.price_paisa, 0);
        const saving = Math.floor((full * bundle.discountPercent) / 100);

        return (
          <div
            key={bundle.slug}
            className="rounded-xl border border-brand-600/20 bg-brand-50/40 p-4"
          >
            <div className="flex items-center gap-2">
              <Layers size={16} className="shrink-0 text-brand-600" />
              <h3 className="text-sm font-semibold text-ink">{bundle.name}</h3>
            </div>

            <ul className="mt-3 space-y-2">
              {bundle.products.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5">
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
                    {p.thumbnail_url ? (
                      <Image
                        src={p.thumbnail_url}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <span className="min-w-0 flex-1 text-sm">
                    {p.id === productId ? (
                      <span className="clamp-2 font-medium text-ink">
                        {p.name}{" "}
                        <span className="text-xs font-normal text-ink-faint">
                          (this item)
                        </span>
                      </span>
                    ) : (
                      <Link
                        href={`/products/${p.slug}`}
                        className="clamp-2 font-medium text-ink hover:text-brand-700"
                      >
                        {p.name}
                      </Link>
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular text-ink-muted">
                    {formatTaka(p.price_paisa)}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-3 border-t border-brand-600/15 pt-2.5 text-sm text-ink-soft">
              Add all {bundle.products.length} and save{" "}
              <strong className="font-semibold tabular text-brand-700">
                {formatTaka(saving)}
              </strong>{" "}
              ({bundle.discountPercent}%)
            </p>
          </div>
        );
      })}
    </div>
  );
}

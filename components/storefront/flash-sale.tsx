"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Zap } from "lucide-react";
import { formatTaka, discountPercent } from "@/lib/utils/money";
import type { LiveFlashSale } from "@/lib/queries/home";

/**
 * Flash sale rail with a live countdown and a per-item stock bar.
 *
 * The prices shown come from `flash_sale_items.sale_price_paisa`, but nothing
 * here is trusted at checkout — `effective_price()` re-derives the sale price
 * server-side and only honours it while the window is open and stock remains.
 */
export function FlashSaleSection({ sale }: { sale: LiveFlashSale }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(sale.ends_at).getTime();
    const tick = () => setRemaining(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [sale.ends_at]);

  // The sale ended while the page was open — stop advertising it.
  if (remaining === 0) return null;

  const hrs = remaining == null ? null : Math.floor(remaining / 3_600_000);
  const mins = remaining == null ? null : Math.floor((remaining % 3_600_000) / 60_000);
  const secs = remaining == null ? null : Math.floor((remaining % 60_000) / 1000);

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="overflow-hidden rounded-2xl border border-sale/25 bg-gradient-to-br from-sale/8 via-surface to-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sale/20 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-sale text-white">
              <Zap size={18} fill="currentColor" />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-ink">{sale.title}</h2>
              {sale.subtitle ? (
                <p className="text-xs text-ink-muted">{sale.subtitle}</p>
              ) : null}
            </div>
          </div>

          {remaining != null ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-ink-muted">Ends in</span>
              <div className="flex gap-1 tabular">
                {[hrs!, mins!, secs!].map((v, i) => (
                  <span
                    key={i}
                    className="min-w-9 rounded-md bg-ink px-1.5 py-1 text-center text-sm font-bold text-white"
                  >
                    {pad(v)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rail flex gap-3 overflow-x-auto p-4">
          {sale.items.map((item) => {
            const p = item.product!;
            const off = discountPercent(item.sale_price_paisa, p.price_paisa);
            const sold = item.stock_limit
              ? Math.min(100, Math.round((item.sold_count / item.stock_limit) * 100))
              : null;

            return (
              <Link
                key={item.id}
                href={`/products/${p.slug}`}
                className="group w-40 shrink-0 rounded-xl border border-line bg-surface p-2.5 transition-shadow hover:shadow-lift sm:w-44"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-sunken">
                  {p.thumbnail_url ? (
                    <Image
                      src={p.thumbnail_url}
                      alt={p.name}
                      fill
                      sizes="176px"
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  ) : null}
                  {off ? (
                    <span className="absolute left-1.5 top-1.5 rounded bg-sale px-1.5 py-0.5 text-[10px] font-bold text-white">
                      -{off}%
                    </span>
                  ) : null}
                </div>

                <h3 className="clamp-2 mt-2 text-xs font-medium leading-4 text-ink">
                  {p.name}
                </h3>

                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="tabular text-sm font-bold text-sale">
                    {formatTaka(item.sale_price_paisa)}
                  </span>
                  <span className="tabular text-[11px] text-ink-faint line-through">
                    {formatTaka(p.price_paisa)}
                  </span>
                </div>

                {sold != null ? (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-sale transition-all"
                        style={{ width: `${Math.max(6, sold)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] font-medium text-ink-muted">
                      {item.sold_count} sold
                      {item.stock_limit ? ` of ${item.stock_limit}` : ""}
                    </p>
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

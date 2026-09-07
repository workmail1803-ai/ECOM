"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Numbered pagination that keeps every other filter in the query string. */
export function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (pageCount <= 1) return null;

  function go(p: number) {
    const next = new URLSearchParams(params.toString());
    p <= 1 ? next.delete("page") : next.set("page", String(p));
    router.push(`${pathname}?${next.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Window of pages around the current one, so 200 pages do not render 200 links.
  const pages: (number | "gap")[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages.at(-1) !== "gap") pages.push("gap");
  }

  return (
    <nav className="mt-8 flex items-center justify-center gap-1" aria-label="Pagination">
      <button
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-ink-soft disabled:opacity-40 enabled:hover:bg-surface-sunken"
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>

      {pages.map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-ink-faint">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => go(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-lg border text-sm tabular",
              p === page
                ? "border-brand-600 bg-brand-600 font-semibold text-white"
                : "border-line text-ink-soft hover:bg-surface-sunken",
            )}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => go(page + 1)}
        disabled={page >= pageCount}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-ink-soft disabled:opacity-40 enabled:hover:bg-surface-sunken"
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

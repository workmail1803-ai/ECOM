import { Skeleton } from "@/components/ui/primitives";

/**
 * Suspense fallbacks for the streamed homepage sections.
 *
 * These reserve roughly the height of the real content so a section arriving
 * late does not shove the rest of the page down — layout shift is the cost
 * streaming usually charges, and it is avoidable.
 */

export function RailSkeleton({ title }: { title?: string }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      {title ? (
        <div className="mb-5 h-7 w-48 rounded-md bg-surface-sunken" aria-hidden />
      ) : null}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="w-[46%] shrink-0 sm:w-[30%] lg:w-[19%]">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton className="mt-3 h-4 w-4/5" />
            <Skeleton className="mt-2 h-4 w-1/3" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading products…</span>
    </section>
  );
}

export function GridSkeleton({
  count = 6,
  className = "h-40",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-5 h-7 w-48 rounded-md bg-surface-sunken" aria-hidden />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} className={`w-full rounded-xl ${className}`} />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </section>
  );
}

/** Table placeholder for the admin panel's streamed panels. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line/60 py-3 last:border-0">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/**
 * KPI tile placeholders for the admin dashboard.
 *
 * Returns bare tiles rather than its own grid — the dashboard places these
 * inside the real stat grid so the tiles that have loaded and the ones still
 * loading sit in the same track, instead of a nested grid breaking the row.
 */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-20" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </>
  );
}

/** Instant shimmer while the products page queries Postgres. */
export default function ProductsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="skeleton mb-4 h-3 w-40 rounded" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="skeleton h-8 w-48 rounded" />
          <div className="skeleton mt-2 h-4 w-28 rounded" />
        </div>
        <div className="skeleton h-10 w-40 rounded-lg" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton mb-2 h-4 w-24 rounded" />
              <div className="space-y-1.5">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="skeleton h-5 w-full rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="skeleton aspect-square" />
              <div className="space-y-2 p-3">
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-2/3 rounded" />
                <div className="skeleton h-5 w-1/3 rounded" />
                <div className="skeleton h-9 w-full rounded-lg" />
                <div className="skeleton h-9 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

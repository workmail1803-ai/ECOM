/**
 * Instant navigation feedback for the storefront shell.
 *
 * Next.js shows this while a Server Component is streaming — so clicking any
 * link feels instant instead of hanging until the database responds.
 */
export default function StorefrontLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Hero shimmer */}
      <div className="skeleton mb-8 h-64 w-full rounded-2xl sm:h-80 lg:h-[420px]" />

      {/* Category tiles shimmer */}
      <div className="mb-8">
        <div className="skeleton mb-4 h-7 w-48 rounded" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-4">
              <div className="skeleton size-12 rounded-full" />
              <div className="skeleton h-3 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Product grid shimmer */}
      <div className="skeleton mb-4 h-7 w-40 rounded" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="skeleton aspect-square" />
            <div className="space-y-2 p-3">
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-5 w-1/3 rounded" />
              <div className="skeleton h-9 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

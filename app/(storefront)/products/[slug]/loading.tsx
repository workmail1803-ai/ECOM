/** Instant shimmer while a product detail page loads. */
export default function ProductDetailLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="skeleton mb-4 h-3 w-56 rounded" />
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Image gallery */}
        <div>
          <div className="skeleton aspect-square w-full rounded-xl" />
          <div className="mt-3 flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton size-16 rounded-lg" />
            ))}
          </div>
        </div>
        {/* Product info */}
        <div className="space-y-4">
          <div className="skeleton h-8 w-4/5 rounded" />
          <div className="skeleton h-5 w-1/3 rounded" />
          <div className="skeleton h-10 w-40 rounded" />
          <div className="skeleton h-5 w-24 rounded" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-20 rounded-lg" />
            ))}
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="skeleton h-12 w-full rounded-lg" />
            <div className="skeleton h-12 w-full rounded-lg" />
          </div>
          <div className="space-y-2 pt-4">
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-3/4 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

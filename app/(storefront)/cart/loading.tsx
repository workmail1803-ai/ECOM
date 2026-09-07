/** Instant shimmer while the cart page loads. */
export default function CartLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="skeleton mb-6 h-8 w-36 rounded" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4 rounded-xl border border-line bg-surface p-4">
              <div className="skeleton size-20 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-4 w-1/3 rounded" />
                <div className="skeleton h-8 w-28 rounded-lg" />
              </div>
              <div className="skeleton h-5 w-16 self-start rounded" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="skeleton mb-4 h-5 w-32 rounded" />
          <div className="space-y-2">
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-2/3 rounded" />
          </div>
          <div className="skeleton mt-4 h-11 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

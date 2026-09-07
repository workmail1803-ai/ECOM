/** Instant shimmer while static content pages load. */
export default function ContentPageLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="skeleton mb-3 h-3 w-40 rounded" />
      <div className="skeleton mb-4 h-9 w-64 rounded" />
      <div className="skeleton mb-6 h-5 w-full rounded" />
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-6 w-48 rounded" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

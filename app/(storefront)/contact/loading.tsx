/** Instant shimmer while the contact page loads. */
export default function ContactLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="skeleton mb-3 h-3 w-32 rounded" />
      <div className="skeleton mb-3 h-9 w-48 rounded" />
      <div className="skeleton mb-6 h-5 w-full rounded" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-5 space-y-2">
            <div className="skeleton size-5 rounded" />
            <div className="skeleton h-4 w-20 rounded" />
            <div className="skeleton h-4 w-40 rounded" />
            <div className="skeleton h-3 w-48 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

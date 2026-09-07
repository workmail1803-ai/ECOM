/** Instant shimmer while the track page loads. */
export default function TrackLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="skeleton mb-2 h-8 w-52 rounded" />
      <div className="skeleton mb-6 h-4 w-80 rounded" />
      <div className="skeleton h-44 w-full rounded-xl" />
    </div>
  );
}

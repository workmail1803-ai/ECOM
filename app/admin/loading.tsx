import { Skeleton } from "@/components/ui/primitives";
import { TableSkeleton } from "@/components/storefront/skeletons";

/**
 * Shown the instant an admin link is clicked.
 *
 * Without it, a click on the sidebar did nothing visible until the next page
 * had finished on the server — every click felt like the panel had frozen.
 * Next prefetches this fallback, so it paints before the request even
 * returns, and the admin layout (sidebar, header) stays put around it.
 */
export default function AdminLoading() {
  return (
    <div aria-busy="true">
      <div className="mb-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}

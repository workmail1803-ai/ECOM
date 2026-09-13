"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { loadMoreProducts } from "@/lib/actions/products";
import { Button } from "@/components/ui/button";

/**
 * Scroll-triggered pagination for the product listing.
 *
 * Page 1 is server-rendered with the page itself; every further page is
 * fetched only once the visitor reaches the bottom of what they already have.
 * A shopper who lands, looks at the first row and leaves costs one query
 * instead of the whole catalogue.
 *
 * The sentinel is watched with `rootMargin`, so the next page starts loading
 * shortly before it is actually needed and the grid rarely appears to stall.
 */
export function LoadMoreProducts({
  query,
  initialNextPage,
}: {
  /**
   * The current listing filters as a query string. A string, not an object,
   * so it is stable across renders — an object prop would be a new identity
   * every time and would reset the list on every parent render.
   */
  query: string;
  /** Null when page 1 is also the last page. */
  initialNextPage: number | null;
}) {
  const [pages, setPages] = useState<ReactNode[]>([]);
  const [nextPage, setNextPage] = useState(initialNextPage);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Guards against a second request firing while the first is in flight —
  // IntersectionObserver can fire again before React has re-rendered.
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current || nextPage == null) return;
    inFlight.current = true;
    setLoading(true);
    setFailed(false);

    try {
      const params = Object.fromEntries(new URLSearchParams(query));
      const result = await loadMoreProducts(params, nextPage);
      setPages((prev) => [...prev, result.nodes]);
      setNextPage(result.nextPage);
    } catch {
      // Leave nextPage as it is so the button can retry the same page.
      setFailed(true);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [query, nextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    // Stop observing once there is nothing left, and never auto-retry a
    // failure — that would hammer the server while it is already unhappy.
    if (!el || nextPage == null || failed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void load();
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [load, nextPage, failed]);

  // A filter change re-renders the page from the server, so anything already
  // appended belongs to the previous query and has to go.
  useEffect(() => {
    setPages([]);
    setNextPage(initialNextPage);
    setFailed(false);
  }, [query, initialNextPage]);

  return (
    <>
      {pages.map((nodes, i) => (
        <div key={i} className="mt-4">
          {nodes}
        </div>
      ))}

      {nextPage != null ? (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {failed ? (
            <div className="text-center">
              <p className="text-sm text-ink-muted">
                Could not load more products.
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={load}>
                Try again
              </Button>
            </div>
          ) : loading ? (
            <span className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 size={16} className="animate-spin" />
              Loading more…
            </span>
          ) : (
            // Shown before the observer fires, and the whole control for
            // anyone whose browser or settings never fire it.
            <Button variant="outline" onClick={load}>
              Load more
            </Button>
          )}
        </div>
      ) : pages.length > 0 ? (
        <p className="py-8 text-center text-sm text-ink-faint">
          That is everything.
        </p>
      ) : null}
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MoreRows {
  /** Server-rendered <tr> elements. */
  nodes: ReactNode;
  nextPage: number | null;
}

/**
 * Scroll-loaded pagination for the admin tables.
 *
 * Generic on purpose: each admin page passes its own server action, which
 * returns rows already rendered on the server. That keeps the row markup in
 * one place per table and means opening a list page costs one page of rows
 * rather than every row the table could show.
 *
 * Renders extra `<tbody>` elements — several are valid in one table, and it
 * avoids re-rendering the rows already on screen.
 */
export function LoadMoreRows({
  action,
  query,
  initialNextPage,
  colSpan,
}: {
  action: (params: Record<string, string>, page: number) => Promise<MoreRows>;
  /** Current filters as a query string — stable across renders. */
  query: string;
  initialNextPage: number | null;
  /** Column count, so the loader row spans the whole table. */
  colSpan: number;
}) {
  const [pages, setPages] = useState<ReactNode[]>([]);
  const [nextPage, setNextPage] = useState(initialNextPage);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinelRef = useRef<HTMLTableRowElement>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current || nextPage == null) return;
    inFlight.current = true;
    setLoading(true);
    setFailed(false);

    try {
      const params = Object.fromEntries(new URLSearchParams(query));
      const result = await action(params, nextPage);
      setPages((prev) => [...prev, result.nodes]);
      setNextPage(result.nextPage);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [action, query, nextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    // Never auto-retry a failure: the button is there for that.
    if (!el || nextPage == null || failed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void load();
      },
      { rootMargin: "400px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [load, nextPage, failed]);

  // A filter change re-renders page 1 from the server; drop what we appended
  // under the old filters.
  useEffect(() => {
    setPages([]);
    setNextPage(initialNextPage);
    setFailed(false);
  }, [query, initialNextPage]);

  return (
    <>
      {pages.map((nodes, i) => (
        <tbody key={i} className="divide-y divide-line border-t border-line">
          {nodes}
        </tbody>
      ))}

      {nextPage != null ? (
        <tbody>
          <tr ref={sentinelRef}>
            <td colSpan={colSpan} className="px-4 py-6 text-center">
              {failed ? (
                <>
                  <span className="text-sm text-ink-muted">
                    Could not load more rows.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-3"
                    onClick={load}
                  >
                    Try again
                  </Button>
                </>
              ) : loading ? (
                <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
                  <Loader2 size={15} className="animate-spin" />
                  Loading more…
                </span>
              ) : (
                <Button variant="outline" size="sm" onClick={load}>
                  Load more
                </Button>
              )}
            </td>
          </tr>
        </tbody>
      ) : null}
    </>
  );
}

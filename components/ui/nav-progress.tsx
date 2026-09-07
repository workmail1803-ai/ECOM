"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin progress bar at the top of the viewport that fires INSTANTLY when
 * the user clicks an internal link.
 *
 * Complements loading.tsx skeletons: the bar starts immediately, then the
 * skeleton takes over once React begins streaming the fallback.
 *
 * For router.push() navigations (filters, sort, search), each component shows
 * its own isPending state via useTransition — the progress bar is not needed
 * for those since the filter panel already dims and the search icon spins.
 */
export function NavProgress() {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Navigation finished — animate out
  useEffect(() => {
    timeoutRef.current = setTimeout(() => setLoading(false), 150);
    return () => clearTimeout(timeoutRef.current);
  }, [pathname, searchParams]);

  // Intercept clicks on internal links (covers <Link> and plain <a>)
  const handleClick = useCallback((e: MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    // Skip external, hash-only, tel:, mailto:, and new-tab links
    if (
      href.startsWith("http") ||
      href.startsWith("#") ||
      href.startsWith("tel:") ||
      href.startsWith("mailto:") ||
      anchor.target === "_blank"
    )
      return;

    // It's an internal navigation — show progress immediately
    setLoading(true);
  }, []);

  useEffect(() => {
    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, [handleClick]);

  if (!loading) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] h-[2.5px]">
      <div
        className="h-full bg-brand-600"
        style={{
          animation: "nav-progress 1.8s cubic-bezier(0.4, 0, 0, 1) forwards",
        }}
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The hero rail's scroller: exactly one card per swipe, whatever the gesture.
 *
 * CSS alone could not do this. `scroll-snap-type: x mandatory` only decides
 * where a fling comes to REST — the browser keeps the momentum, sails over
 * several snap points and settles on whichever one it ran out of speed near.
 * `scroll-snap-stop: always` is meant to forbid exactly that, and it does work
 * for programmatic and wheel scrolling, but real touch flings still carried
 * past several cards.
 *
 * So the horizontal gesture is taken away from the browser entirely:
 * `touch-action: pan-y` lets it keep vertical page scrolling and nothing else,
 * and the drag is handled here. The target index is clamped to the index the
 * finger started on ±1, which is what makes the guarantee absolute — the
 * length and speed of the swipe decide only the DIRECTION, never the distance.
 *
 * Native overflow scrolling is left in place so the keyboard, a trackpad and
 * assistive tech still work; only touch is intercepted.
 */
export function HeroRail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);

  // Gesture state. Refs, not state — these change every touchmove and must not
  // trigger a re-render.
  const startX = useRef(0);
  const startY = useRef(0);
  const startScroll = useRef(0);
  const startIndex = useRef(0);
  const dragging = useRef(false);
  // Until the first move we do not know whether this is a horizontal swipe or
  // the beginning of a vertical page scroll.
  const axis = useRef<"unknown" | "x" | "y">("unknown");

  /** Distance from one card's left edge to the next, including the gap. */
  const step = useCallback(() => {
    const el = ref.current;
    if (!el || el.children.length < 2) return el?.clientWidth ?? 0;
    const a = el.children[0] as HTMLElement;
    const b = el.children[1] as HTMLElement;
    const d = b.offsetLeft - a.offsetLeft;
    return d > 0 ? d : a.getBoundingClientRect().width;
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const el = ref.current;
      if (!el) return;
      const s = step();
      const max = el.children.length - 1;
      const clamped = Math.max(0, Math.min(max, index));
      el.scrollTo({ left: clamped * s, behavior: "smooth" });
    },
    [step],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX.current = t.clientX;
      startY.current = t.clientY;
      startScroll.current = el.scrollLeft;
      startIndex.current = Math.round(el.scrollLeft / (step() || 1));
      dragging.current = true;
      axis.current = "unknown";
      // Snapping would fight the scrollLeft we set while the finger moves.
      el.style.scrollSnapType = "none";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      const t = e.touches[0];
      if (!t) return;

      const dx = t.clientX - startX.current;
      const dy = t.clientY - startY.current;

      if (axis.current === "unknown") {
        // Wait for a few pixels before committing, so a slightly slanted
        // vertical scroll is not stolen and turned into a card swipe.
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (axis.current === "y") return; // let the page scroll

      // Follow the finger, so the swipe feels direct rather than like a button.
      el.scrollLeft = startScroll.current - dx;
    };

    const onTouchEnd = () => {
      if (!dragging.current) return;
      dragging.current = false;
      el.style.scrollSnapType = "";

      if (axis.current !== "x") return;

      const moved = el.scrollLeft - startScroll.current;
      const s = step() || 1;
      // A short drag springs back; anything decisive advances one card and
      // one card only — `startIndex ± 1`, never a distance derived from how
      // far the finger travelled.
      const threshold = Math.min(48, s * 0.15);

      if (Math.abs(moved) < threshold) goTo(startIndex.current);
      else goTo(startIndex.current + (moved > 0 ? 1 : -1));
    };

    // passive: touchmove sets scrollLeft rather than calling preventDefault
    // (touch-action already stopped the browser panning), so it can stay
    // passive and not cost us scroll performance.
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [goTo, step]);

  return (
    <ul
      ref={ref}
      // touch-action: pan-y — the browser keeps vertical scrolling, we take
      // the horizontal gesture. Without this the native fling still runs
      // underneath and undoes the whole point.
      className="
        rail flex touch-pan-y gap-2 overflow-x-auto px-2 pb-0.5
        scroll-pl-2 sm:px-3 sm:scroll-pl-3
      "
    >
      {children}
    </ul>
  );
}

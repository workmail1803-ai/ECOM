"use client";

import { useEffect } from "react";
import { recordProductView } from "@/lib/actions/catalog";

const KEY = "bidyut_recent";
const MAX = 20;

/**
 * Records a product view.
 *
 * Signed in  → a `recently_viewed` row, capped at 20 by a trigger.
 * Signed out → localStorage only. Writing a DB row for every anonymous page
 *              view is the single easiest way to exhaust the free tier.
 */
export function RecentlyViewedTracker({
  productId,
  signedIn,
}: {
  productId: string;
  signedIn: boolean;
}) {
  useEffect(() => {
    if (signedIn) {
      void recordProductView(productId);
      return;
    }

    try {
      const raw = localStorage.getItem(KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const next = [productId, ...list.filter((id) => id !== productId)].slice(0, MAX);
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private mode / storage disabled — recently-viewed is a nicety.
    }
  }, [productId, signedIn]);

  return null;
}

/** Read the guest history. Used by the recently-viewed rail. */
export function readGuestHistory(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

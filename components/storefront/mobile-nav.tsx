"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import type { Category } from "@/types/database";

const SECONDARY = [
  ["/track", "Track order"],
  ["/account/orders", "My orders"],
  ["/delivery", "Delivery charges"],
  ["/returns", "Returns"],
] as const;

export function MobileNav({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Lock the page behind the drawer, and restore on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const drawer = (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        className="absolute inset-0 bg-ink/40"
        onClick={() => setOpen(false)}
        aria-label="Close menu"
        tabIndex={-1}
      />
      <nav
        className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-surface shadow-pop"
        aria-label="Browse"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
          <span className="text-lg font-bold">Browse</span>
          <button
            onClick={() => setOpen(false)}
            className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-sunken"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <Link
            href="/products"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            All products
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/products?category=${c.slug}`}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm text-ink-soft hover:bg-surface-sunken"
            >
              {c.name}
            </Link>
          ))}
        </div>

        <div className="shrink-0 border-t border-line p-2">
          {SECONDARY.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-surface-sunken"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-sunken md:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu size={20} />
      </button>

      {/*
        Portalled to <body> on purpose. The header sets `backdrop-blur`, and a
        `backdrop-filter` makes an element a containing block for
        position:fixed descendants — so a drawer rendered inside the header
        would size itself to the header (~135px tall) instead of the viewport.
      */}
      {mounted && open ? createPortal(drawer, document.body) : null}
    </>
  );
}

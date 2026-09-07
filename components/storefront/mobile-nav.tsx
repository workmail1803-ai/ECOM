"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import type { Category } from "@/types/database";

export function MobileNav({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-sunken md:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            tabIndex={-1}
          />
          <nav className="absolute left-0 top-0 flex h-full w-[82%] max-w-xs flex-col bg-surface shadow-pop">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <span className="text-lg font-bold">Browse</span>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-sunken"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
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

            <div className="border-t border-line p-2">
              {[
                ["/track", "Track order"],
                ["/account/orders", "My orders"],
                ["/delivery", "Delivery charges"],
                ["/returns", "Returns"],
              ].map(([href, label]) => (
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
      ) : null}
    </>
  );
}

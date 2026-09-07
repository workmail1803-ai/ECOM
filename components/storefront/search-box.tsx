"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";

/**
 * Header search. Submits to /products?q=… rather than querying as you type —
 * a suggestion request per keystroke is the fastest way to exhaust the free
 * tier's connection pool.
 */
export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
  }

  return (
    <form onSubmit={onSubmit} role="search" className="relative w-full">
      <Search
        size={17}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search phones, laptops, audio…"
        aria-label="Search products"
        className="h-10 w-full rounded-lg border border-line-strong bg-surface-sunken pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600/15"
      />
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Tag,
  Flame,
  ChevronRight,
  Users,
  Truck,
  Handshake,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "@/types/database";

const NAVIGATION: { href: string; label: string }[] = [
  { href: "/products", label: "All products" },
  { href: "/track", label: "Track order" },
  { href: "/account/orders", label: "My orders" },
  { href: "/account/wishlist", label: "Wishlist" },
  { href: "/delivery", label: "Delivery charges" },
  { href: "/shipping", label: "Shipping policy" },
  { href: "/returns", label: "Returns & replacement" },
  { href: "/warranty", label: "Warranty" },
  { href: "/payments", label: "Payment methods" },
  { href: "/authenticity", label: "Authenticity" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact" },
];

const PARTNER_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/group-buy", label: "Group Buy", icon: Users },
  { href: "/dropship", label: "Dropship", icon: Truck },
  { href: "/be-partner", label: "Be Partner", icon: Handshake },
];

/**
 * Browse drawer: categories on one tab, everything else on the other.
 *
 * Opens from the hamburger on mobile and from the "Categories" button in the
 * desktop nav bar, so there is one list to maintain rather than a mobile menu
 * and a separate desktop mega-menu that drift apart.
 */
export function CategoryDrawer({
  categories,
  variant = "icon",
}: {
  categories: Category[];
  /**
   * "icon" is the mobile hamburger, "bar" the desktop Categories button.
   * The header renders both; only one is visible at a breakpoint, so the two
   * instances can never be open at the same time.
   */
  variant?: "icon" | "bar";
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"categories" | "navigation">("categories");
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  // A drawer that survives navigation covers the page the visitor just asked for.
  useEffect(() => setOpen(false), [pathname]);

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

  const close = () => setOpen(false);

  const drawer = (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-ink/45"
        onClick={close}
        aria-label="Close menu"
        tabIndex={-1}
      />

      <nav
        className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-surface shadow-pop"
        aria-label="Browse"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <span className="text-base font-bold tracking-tight text-ink">Browse</span>
          <button
            onClick={close}
            className="inline-flex size-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-sunken"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Two tabs rather than one long scroll — the category list alone is
            long enough that policy links below it were never reached. */}
        <div
          role="tablist"
          aria-label="Browse sections"
          className="grid shrink-0 grid-cols-2 border-b border-line"
        >
          {(["categories", "navigation"] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`relative py-3 text-sm font-semibold capitalize transition-colors ${
                tab === key
                  ? "text-brand-700"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {key}
              {tab === key ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600" />
              ) : null}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {tab === "categories" ? (
            <ul className="p-2">
              <li>
                <Link
                  href="/products"
                  onClick={close}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"
                >
                  <LayoutGrid size={17} className="shrink-0 text-ink-faint" />
                  <span className="flex-1">All products</span>
                  <ChevronRight size={15} className="shrink-0 text-ink-faint" />
                </Link>
              </li>

              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/products?category=${c.slug}`}
                    onClick={close}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-soft hover:bg-surface-sunken hover:text-ink"
                  >
                    <Tag size={17} className="shrink-0 text-ink-faint" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <ChevronRight size={15} className="shrink-0 text-ink-faint" />
                  </Link>
                </li>
              ))}

              {/* Discounted stock, called out in red because it is the row
                  people open this drawer looking for. */}
              <li className="mt-1 border-t border-line pt-1">
                <Link
                  href="/products?on_sale=1"
                  onClick={close}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-danger hover:bg-danger-soft"
                >
                  <Flame size={17} className="shrink-0" />
                  <span className="flex-1">Sale</span>
                  <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Hot
                  </span>
                </Link>
              </li>
            </ul>
          ) : (
            <ul className="p-2">
              {NAVIGATION.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={close}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-soft hover:bg-surface-sunken hover:text-ink"
                  >
                    <span className="flex-1">{label}</span>
                    <ChevronRight size={15} className="shrink-0 text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-line bg-surface-sunken/60 p-3">
          <div className="grid grid-cols-3 gap-2">
            {PARTNER_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={close}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-surface px-1 py-2.5 text-center text-[11px] font-semibold leading-tight text-ink-soft transition-colors hover:border-brand-600 hover:text-brand-700"
              >
                <Icon size={17} className="text-brand-600" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );

  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex size-10 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-sunken md:hidden"
          aria-label="Open menu"
          aria-expanded={open}
        >
          <Menu size={20} />
        </button>
      ) : (
        /* The desktop trigger sits in the category bar, where a shopper looks
           for "all categories" on every other BD storefront. */
        <button
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          aria-label="Open categories"
          aria-expanded={open}
        >
          <Menu size={16} />
          Categories
        </button>
      )}

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

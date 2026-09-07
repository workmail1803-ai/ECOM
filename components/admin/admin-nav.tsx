"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingBag,
  Users,
  Ticket,
  Image as ImageIcon,
  Star,
  Truck,
  BarChart3,
  Settings,
  Menu,
  X,
  CreditCard,
} from "lucide-react";
import type { AppRole } from "@/types/database";
import { cn } from "@/lib/utils/cn";

/** `adminOnly` items are hidden from managers — the RLS policies agree. */
const SECTIONS: {
  title: string;
  links: { href: string; label: string; icon: typeof Package; adminOnly?: boolean }[];
}[] = [
  {
    title: "Overview",
    links: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Catalog",
    links: [
      { href: "/admin/products", label: "Products", icon: Package },
      { href: "/admin/categories", label: "Categories", icon: FolderTree },
      { href: "/admin/stock", label: "Stock", icon: Truck },
    ],
  },
  {
    title: "Sales",
    links: [
      { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/customers", label: "Customers", icon: Users },
    ],
  },
  {
    title: "Marketing",
    links: [
      { href: "/admin/coupons", label: "Coupons", icon: Ticket },
      { href: "/admin/banners", label: "Banners", icon: ImageIcon },
      { href: "/admin/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    title: "Insight",
    links: [
      { href: "/admin/reports", label: "Reports", icon: BarChart3 },
      { href: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
    ],
  },
];

export function AdminNav({ role }: { role: AppRole }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-line px-4">
        <span className="text-lg font-bold tracking-tight text-ink">Nazmul</span>
        <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
          Admin
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {SECTIONS.map((section) => {
          const links = section.links.filter(
            (l) => !l.adminOnly || role === "admin",
          );
          if (links.length === 0) return null;

          return (
            <div key={section.title} className="mb-4">
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {section.title}
              </p>
              {links.map((l) => {
                const active =
                  l.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-ink-soft hover:bg-surface-sunken",
                    )}
                  >
                    <l.icon size={16} />
                    {l.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-40 inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface lg:hidden"
        aria-label="Open admin menu"
      >
        <Menu size={18} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            tabIndex={-1}
          />
          <div className="absolute left-0 top-0 h-full w-72 bg-surface shadow-pop">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-lg hover:bg-surface-sunken"
              aria-label="Close menu"
            >
              <X size={17} />
            </button>
            {nav}
          </div>
        </div>
      ) : null}

      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block">
        <div className="sticky top-0 h-dvh">{nav}</div>
      </aside>
    </>
  );
}

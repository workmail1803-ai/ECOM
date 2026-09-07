"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Heart, MapPin, User, LogOut, KeyRound } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils/cn";

const LINKS = [
  { href: "/account", label: "Overview", icon: User, exact: true },
  { href: "/account/orders", label: "My orders", icon: Package },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/password", label: "Password", icon: KeyRound },
];

export function AccountNav({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();

  return (
    <aside>
      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="truncate text-sm font-semibold text-ink">{name}</p>
        <p className="truncate text-xs text-ink-muted">{email}</p>
      </div>

      <nav className="mt-3 rounded-xl border border-line bg-surface p-2">
        {LINKS.map((l) => {
          const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
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

        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </form>
      </nav>
    </aside>
  );
}

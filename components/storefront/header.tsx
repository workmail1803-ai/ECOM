import { Suspense } from "react";
import Link from "next/link";
import { Phone, Heart, Package } from "lucide-react";
import { getCategories } from "@/lib/queries/catalog";
import { getStoreSettings } from "@/lib/queries/settings";
import { getCartQuote } from "@/lib/actions/cart";
import { getSessionUser, isStaffRole } from "@/lib/auth/session";
import { SearchBox } from "./search-box";
import { CartButton } from "./cart-button";
import { CategoryDrawer } from "./category-drawer";
import { AccountMenu } from "./account-menu";

export async function Header() {
  const [categories, settings, quote, user] = await Promise.all([
    getCategories(),
    getStoreSettings(),
    getCartQuote(),
    getSessionUser(),
  ]);

  const topLevel = categories.filter((c) => !c.parent_id);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      {/* Utility strip — support number and order tracking, the two things BD
          shoppers reach for most. */}
      <div className="hidden border-b border-line bg-ink text-white md:block">
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-4 text-xs">
          <p className="text-white/70">{settings.store_tagline}</p>
          <div className="flex items-center gap-5">
            <a
              href={`tel:${settings.support_phone}`}
              className="flex items-center gap-1.5 text-white/80 hover:text-white"
            >
              <Phone size={13} />
              {settings.support_phone}
            </a>
            <Link href="/track" className="text-white/80 hover:text-white">
              Track order
            </Link>
            <Link href="/delivery" className="text-white/80 hover:text-white">
              Delivery
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <CategoryDrawer categories={topLevel} />

        <Link href="/" className="flex shrink-0 flex-col">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-ink">
              {settings.store_name}
            </span>
            <span className="hidden h-1.5 w-1.5 rounded-full bg-brand-600 sm:block" />
          </div>
          <span className="text-[9px] leading-tight tracking-wide text-ink-faint">
            Developed by Nafis Hossain Momen
          </span>
        </Link>

        <div className="ml-2 hidden flex-1 md:block">
          <Suspense>
            <SearchBox />
          </Suspense>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/account/wishlist"
            className="hidden size-10 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-sunken sm:inline-flex"
            aria-label="Wishlist"
          >
            <Heart size={19} />
          </Link>

          <AccountMenu
            name={user ? user.profile?.full_name?.split(" ")[0] ?? "Account" : null}
          />

          <CartButton count={quote.item_count} />
        </div>
      </div>

      {/* Search moves below the logo on mobile so the tap target stays large. */}
      <div className="border-t border-line px-4 py-2 md:hidden">
        <SearchBox />
      </div>

      <nav className="hidden border-t border-line md:block">
        <div className="mx-auto flex h-11 max-w-7xl items-center gap-1 overflow-x-auto px-4">
          <CategoryDrawer categories={topLevel} variant="bar" />
          <Link
            href="/products"
            className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            All products
          </Link>
          {topLevel.map((c) => (
            <Link
              key={c.id}
              href={`/products?category=${c.slug}`}
              className="shrink-0 rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-sunken hover:text-ink"
            >
              {c.name}
            </Link>
          ))}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {isStaffRole(user?.role) ? (
              <Link
                href="/admin"
                className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-soft"
              >
                Admin
              </Link>
            ) : null}
            <Link
              href="/track"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-sunken"
            >
              <Package size={15} />
              Track
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}

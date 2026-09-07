import Link from "next/link";
import { ShoppingBag } from "lucide-react";

/** Cart entry point. `count` comes from quote_cart().item_count, never a client tally. */
export function CartButton({ count }: { count: number }) {
  return (
    <Link
      href="/cart"
      className="relative inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-ink-soft hover:bg-surface-sunken"
      aria-label={count > 0 ? `Cart, ${count} items` : "Cart, empty"}
    >
      <span className="relative">
        <ShoppingBag size={20} />
        {count > 0 ? (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white tabular">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
      <span className="hidden text-sm font-medium lg:inline">Cart</span>
    </Link>
  );
}

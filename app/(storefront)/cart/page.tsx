import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { getCartQuote } from "@/lib/actions/cart";
import { getDeliveryOptions } from "@/lib/queries/delivery";
import { CartView } from "@/components/cart/cart-view";
import { EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Your cart" };

// A cart is per-visitor; never cache it.
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const [quote, deliveryOptions] = await Promise.all([
    getCartQuote(),
    getDeliveryOptions(),
  ]);

  if (quote.lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          icon={<ShoppingCart size={32} />}
          title="Your cart is empty"
          description="Browse the catalogue and add something you like — cash on delivery is available nationwide."
          action={
            <Button asChild size="lg">
              <Link href="/products">Start shopping</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Your cart</h1>
      <p className="mt-1 text-sm text-ink-muted tabular">
        {quote.item_count} {quote.item_count === 1 ? "item" : "items"}
      </p>
      <CartView initialQuote={quote} deliveryOptions={deliveryOptions} />
    </div>
  );
}

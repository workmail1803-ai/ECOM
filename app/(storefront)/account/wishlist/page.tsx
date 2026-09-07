import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_CARD_COLUMNS, type ProductCard as Card } from "@/lib/queries/catalog";
import { ProductGrid } from "@/components/storefront/sections";
import { PageHeader, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Wishlist" };
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("wishlist_items")
    .select("product_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const ids = (rows ?? []).map((r) => r.product_id);

  const { data: products } = ids.length
    ? await supabase
        .from("products")
        .select(PRODUCT_CARD_COLUMNS)
        .in("id", ids)
        .eq("status", "active")
    : { data: [] };

  const list = (products as unknown as Card[]) ?? [];
  // Preserve wishlist order (newest saved first) — `in()` does not.
  const byId = new Map(list.map((p) => [p.id, p]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Card[];

  return (
    <>
      <PageHeader
        title="Wishlist"
        description="Things you saved. Prices update automatically."
      />

      {ordered.length === 0 ? (
        <EmptyState
          icon={<Heart size={30} />}
          title="Nothing saved yet"
          description="Tap the heart on any product to keep it here for later."
          action={
            <Button asChild>
              <Link href="/products">Browse products</Link>
            </Button>
          }
        />
      ) : (
        <ProductGrid products={ordered} />
      )}
    </>
  );
}

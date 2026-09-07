import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_CARD_COLUMNS, type ProductCard } from "./catalog";
import type { Banner, Category, FlashSale, FlashSaleItem } from "@/types/database";

/**
 * Homepage data.
 *
 * One function, one round of parallel queries. The homepage is the most-hit
 * route on the site, so it must not fan out into a query per component.
 */

export interface LiveFlashSale extends FlashSale {
  items: (FlashSaleItem & { product: ProductCard | null })[];
}

export interface HomeData {
  heroBanners: Banner[];
  promoStrip: Banner | null;
  offerCards: Banner[];
  featuredCategories: Category[];
  featured: ProductCard[];
  newArrivals: ProductCard[];
  bestSellers: ProductCard[];
  flashSale: LiveFlashSale | null;
}

export const getHomeData = cache(async (): Promise<HomeData> => {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [
    banners,
    categories,
    featured,
    newArrivals,
    bestSellers,
    sales,
  ] = await Promise.all([
    supabase
      .from("banners")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: false }),
    supabase
      .from("categories")
      .select("*")
      .eq("is_active", true)
      .is("parent_id", null)
      .order("position"),
    supabase
      .from("products")
      .select(PRODUCT_CARD_COLUMNS)
      .eq("status", "active")
      .eq("is_featured", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from("products")
      .select(PRODUCT_CARD_COLUMNS)
      .eq("status", "active")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(12),
    supabase
      .from("products")
      .select(PRODUCT_CARD_COLUMNS)
      .eq("status", "active")
      .order("units_sold", { ascending: false })
      .limit(8),
    supabase
      .from("flash_sales")
      .select("*")
      .eq("is_active", true)
      .lte("starts_at", nowIso)
      .gte("ends_at", nowIso)
      .order("ends_at", { ascending: true })
      .limit(1),
  ]);

  const allBanners = (banners.data as Banner[]) ?? [];
  // The banner RLS policy already filters the schedule window, but banners are
  // cached across requests, so re-check the window here.
  const live = allBanners.filter(
    (b) =>
      (!b.starts_at || b.starts_at <= nowIso) &&
      (!b.ends_at || b.ends_at >= nowIso),
  );

  let flashSale: LiveFlashSale | null = null;
  const sale = (sales.data as unknown as FlashSale[] | null)?.[0];
  if (sale) {
    const { data: items } = await supabase
      .from("flash_sale_items")
      .select("*")
      .eq("flash_sale_id", sale.id)
      .order("position");

    const saleItems = (items as FlashSaleItem[]) ?? [];
    const productIds = saleItems.map((i) => i.product_id);

    const { data: products } = productIds.length
      ? await supabase
          .from("products")
          .select(PRODUCT_CARD_COLUMNS)
          .in("id", productIds)
          .eq("status", "active")
      : { data: [] };

    const byId = new Map(
      ((products as unknown as ProductCard[]) ?? []).map((p) => [p.id, p]),
    );

    flashSale = {
      ...sale,
      items: saleItems
        .map((i) => ({ ...i, product: byId.get(i.product_id) ?? null }))
        .filter((i) => i.product !== null),
    };
  }

  return {
    heroBanners: live.filter((b) => b.placement === "hero"),
    promoStrip: live.find((b) => b.placement === "promo_strip") ?? null,
    offerCards: live.filter((b) => b.placement === "offer_card"),
    featuredCategories: (categories.data as Category[]) ?? [],
    featured: (featured.data as unknown as ProductCard[]) ?? [],
    newArrivals: (newArrivals.data as unknown as ProductCard[]) ?? [],
    bestSellers: (bestSellers.data as unknown as ProductCard[]) ?? [],
    flashSale,
  };
});

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Promotions, for display only.
 *
 * Every figure a customer is actually charged comes from `quote_cart`. These
 * reads exist so a product page can advertise an offer before the item is in
 * the cart — if they ever disagree with the quote, the quote is right.
 */

export interface QuantityBreak {
  minQuantity: number;
  discountPercent: number;
}

export interface BundleOffer {
  slug: string;
  name: string;
  description: string | null;
  discountPercent: number;
  products: { id: string; name: string; slug: string; thumbnail_url: string | null; price_paisa: number }[];
}

/**
 * Quantity breaks that apply to one product, cheapest tier first.
 *
 * A rule naming the product wins over one naming its category — the same
 * precedence quote_cart applies, so the page cannot promise a tier the cart
 * then ignores.
 */
export const getQuantityBreaks = cache(
  async (productId: string, categoryId: string | null): Promise<QuantityBreak[]> => {
    const supabase = await createClient();

    const { data } = await supabase
      .from("quantity_breaks")
      .select("product_id, min_quantity, discount_percent")
      .eq("is_active", true)
      .or(
        categoryId
          ? `product_id.eq.${productId},category_id.eq.${categoryId}`
          : `product_id.eq.${productId}`,
      )
      .order("min_quantity");

    const rows =
      (data as
        | { product_id: string | null; min_quantity: number; discount_percent: number }[]
        | null) ?? [];

    const productRules = rows.filter((r) => r.product_id === productId);
    const chosen = productRules.length > 0 ? productRules : rows;

    return chosen.map((r) => ({
      minQuantity: r.min_quantity,
      discountPercent: Number(r.discount_percent),
    }));
  },
);

/** Live bundles that include this product, with their other members. */
export const getBundlesForProduct = cache(
  async (productId: string): Promise<BundleOffer[]> => {
    const supabase = await createClient();
    const nowIso = new Date().toISOString();

    const { data: memberships } = await supabase
      .from("bundle_items")
      .select("bundle_id")
      .eq("product_id", productId);

    const ids = [
      ...new Set(((memberships ?? []) as { bundle_id: string }[]).map((m) => m.bundle_id)),
    ];
    if (ids.length === 0) return [];

    const { data: bundles } = await supabase
      .from("bundles")
      .select("id, slug, name, description, discount_percent, starts_at, ends_at")
      .in("id", ids)
      .eq("is_active", true);

    const live = ((bundles ?? []) as {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      discount_percent: number;
      starts_at: string | null;
      ends_at: string | null;
    }[]).filter(
      (b) =>
        (!b.starts_at || b.starts_at <= nowIso) && (!b.ends_at || b.ends_at >= nowIso),
    );
    if (live.length === 0) return [];

    const { data: items } = await supabase
      .from("bundle_items")
      .select("bundle_id, product_id")
      .in("bundle_id", live.map((b) => b.id));

    const rows = (items ?? []) as { bundle_id: string; product_id: string }[];
    const productIds = [...new Set(rows.map((r) => r.product_id))];

    const { data: products } = await supabase
      .from("products")
      .select("id, name, slug, thumbnail_url, price_paisa")
      .in("id", productIds)
      .eq("status", "active");

    const byId = new Map(
      ((products ?? []) as BundleOffer["products"]).map((p) => [p.id, p]),
    );

    return live
      .map((b) => ({
        slug: b.slug,
        name: b.name,
        description: b.description,
        discountPercent: Number(b.discount_percent),
        products: rows
          .filter((r) => r.bundle_id === b.id)
          .map((r) => byId.get(r.product_id))
          .filter((p): p is BundleOffer["products"][number] => Boolean(p)),
      }))
      // A bundle whose other half has been archived is not an offer.
      .filter((b) => b.products.length > 1);
  },
);

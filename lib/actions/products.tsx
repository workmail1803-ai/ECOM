"use server";

import type { ReactNode } from "react";
import { listProducts } from "@/lib/queries/catalog";
import { parseProductQuery } from "@/lib/validations/catalog";
import { ProductGrid } from "@/components/storefront/sections";

export interface MoreProducts {
  /** Server-rendered cards, ready to append. */
  nodes: ReactNode;
  /** Null once the last page has been served. */
  nextPage: number | null;
}

/**
 * Fetch one more page of the listing and return it already rendered.
 *
 * Returning nodes rather than JSON keeps ProductCard a Server Component: the
 * cards are rendered on the server and streamed to the client as an RSC
 * payload, so infinite scroll costs no extra client-side JavaScript and no
 * duplicated card markup. It also means the page never holds more rows in
 * memory than the visitor has actually scrolled to — which is the point on a
 * 1 GB free tier.
 *
 * The query is re-parsed here rather than trusted: `page` is bounded to 500
 * and every filter is re-validated, so a crafted request cannot ask for an
 * unbounded scan.
 */
export async function loadMoreProducts(
  params: Record<string, string>,
  page: number,
): Promise<MoreProducts> {
  const query = parseProductQuery({ ...params, page: String(page) });
  const { products, pageCount, page: current } = await listProducts(query);

  return {
    nodes: <ProductGrid products={products} />,
    nextPage: current < pageCount ? current + 1 : null,
  };
}

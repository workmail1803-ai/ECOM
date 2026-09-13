"use server";

import {
  listAdminProducts,
  listAdminCustomers,
  getCategoryNames,
} from "@/lib/queries/admin";
import { ProductRows } from "@/components/admin/product-rows";
import { CustomerRows } from "@/components/admin/customer-rows";
import type { MoreRows } from "@/components/admin/load-more-rows";

/**
 * Server actions backing the admin tables' scroll loading.
 *
 * Each returns rows already rendered, so the client component only ever
 * appends an RSC payload and the row markup stays defined once, on the server.
 *
 * Authorisation is NOT assumed from the page that rendered the loader: every
 * underlying query calls `requirePermission` itself, because a server action
 * is a public endpoint that anyone can call directly.
 */
export async function loadMoreAdminProducts(
  params: Record<string, string>,
  page: number,
): Promise<MoreRows> {
  const [{ rows, nextPage }, categoryName] = await Promise.all([
    listAdminProducts({ q: params.q, status: params.status, page }),
    getCategoryNames(),
  ]);

  return {
    nodes: <ProductRows rows={rows} categoryName={categoryName} />,
    nextPage,
  };
}

export async function loadMoreAdminCustomers(
  params: Record<string, string>,
  page: number,
): Promise<MoreRows> {
  const { rows, nextPage, staff } = await listAdminCustomers({ q: params.q, page });

  return {
    // `staff` comes from the permission check inside the query, not from the
    // client — the caller cannot talk itself into an admin-only role select.
    nodes: (
      <CustomerRows
        rows={rows}
        staffId={staff.id}
        staffIsAdmin={staff.role === "admin"}
      />
    ),
    nextPage,
  };
}

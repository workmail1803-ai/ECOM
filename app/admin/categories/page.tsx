import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CategoryManager } from "@/components/admin/category-manager";
import { PageHeader } from "@/components/ui/primitives";
import type { Category } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  await requirePermission("categories");
  const db = createAdminClient();

  const { data: categoryRows } = await db
    .from("categories")
    .select("*")
    .order("position");
  const categories = (categoryRows ?? []) as Category[];

  // One head-count per category rather than pulling every product row back to
  // tally them here. The old version selected `category_id` for the entire
  // catalogue and counted in JS — fine at 25 products, a way to exhaust the
  // function's memory at 50,000. `head: true` returns no rows at all, just the
  // count, and there are only ever a handful of categories.
  const countResults = await Promise.all(
    categories.map((c) =>
      db
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("category_id", c.id)
        .neq("status", "archived"),
    ),
  );

  const productCount = new Map<string, number>(
    categories.map((c, i) => [c.id, countResults[i]?.count ?? 0]),
  );

  return (
    <>
      <PageHeader
        title="Categories"
        description="These drive the storefront nav, the homepage tiles and the listing filters."
      />
      <CategoryManager
        categories={categories}
        productCount={Object.fromEntries(productCount)}
      />
    </>
  );
}

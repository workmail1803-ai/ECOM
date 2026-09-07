import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CategoryManager } from "@/components/admin/category-manager";
import { PageHeader } from "@/components/ui/primitives";
import type { Category } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  await requireStaff();
  const db = createAdminClient();

  const [{ data: categories }, { data: counts }] = await Promise.all([
    db.from("categories").select("*").order("position"),
    db.from("products").select("category_id").neq("status", "archived"),
  ]);

  const productCount = new Map<string, number>();
  for (const row of (counts ?? []) as { category_id: string | null }[]) {
    if (!row.category_id) continue;
    productCount.set(row.category_id, (productCount.get(row.category_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title="Categories"
        description="These drive the storefront nav, the homepage tiles and the listing filters."
      />
      <CategoryManager
        categories={(categories ?? []) as Category[]}
        productCount={Object.fromEntries(productCount)}
      />
    </>
  );
}

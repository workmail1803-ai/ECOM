import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProductForm } from "@/components/admin/product-form";
import { PageHeader } from "@/components/ui/primitives";
import type { Brand, Category } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireStaff();
  const db = createAdminClient();

  const [{ data: categories }, { data: brands }] = await Promise.all([
    db.from("categories").select("*").order("position"),
    db.from("brands").select("*").order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="New product"
        description="It stays a draft until you set the status to Active."
      />
      <ProductForm
        product={null}
        categories={(categories ?? []) as Category[]}
        brands={(brands ?? []) as Brand[]}
      />
    </>
  );
}

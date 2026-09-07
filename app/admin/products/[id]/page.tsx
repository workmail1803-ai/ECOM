import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProductForm } from "@/components/admin/product-form";
import { PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import type { Brand, Category, ProductAdmin } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireStaff();
  const db = createAdminClient();

  // Service role, so `cost_paisa` comes back — it is revoked for both client
  // roles at the column level in migration 0011.
  const [{ data: product }, { data: categories }, { data: brands }] =
    await Promise.all([
      db.from("products").select("*").eq("id", id).maybeSingle(),
      db.from("categories").select("*").order("position"),
      db.from("brands").select("*").order("name"),
    ]);

  if (!product) notFound();
  const p = product as ProductAdmin;

  return (
    <>
      <Link
        href="/admin/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={15} />
        All products
      </Link>

      <PageHeader
        title={p.name}
        description={`SKU ${p.sku} · ${p.units_sold} sold`}
        actions={
          p.status === "active" ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/products/${p.slug}`} target="_blank">
                View live
                <ExternalLink size={14} />
              </Link>
            </Button>
          ) : undefined
        }
      />

      <ProductForm
        product={p}
        categories={(categories ?? []) as Category[]}
        brands={(brands ?? []) as Brand[]}
      />
    </>
  );
}

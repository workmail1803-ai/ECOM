import Link from "next/link";
import Image from "next/image";
import { Plus, Pencil, Package } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ProductStatusToggle } from "@/components/admin/product-status-toggle";
import { formatTaka } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireStaff();
  const { q, status } = await searchParams;

  const db = createAdminClient();
  let query = db
    .from("products")
    .select(
      "id, name, slug, sku, price_paisa, compare_at_paisa, cost_paisa, stock, status, thumbnail_url, units_sold, low_stock_threshold, category_id",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && status !== "all") query = query.eq("status", status);
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);

  const [{ data: products }, { data: categories }] = await Promise.all([
    query,
    db.from("categories").select("id, name"),
  ]);

  const rows = (products ?? []) as {
    id: string;
    name: string;
    slug: string;
    sku: string;
    price_paisa: number;
    compare_at_paisa: number | null;
    cost_paisa: number | null;
    stock: number;
    status: "draft" | "active" | "archived";
    thumbnail_url: string | null;
    units_sold: number;
    low_stock_threshold: number;
    category_id: string | null;
  }[];

  const categoryName = new Map(
    ((categories ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );

  const filters = [
    ["all", "All"],
    ["active", "Active"],
    ["draft", "Draft"],
    ["archived", "Archived"],
  ] as const;

  return (
    <>
      <PageHeader
        title="Products"
        description={`${rows.length} shown. Margin is visible here because admin reads run as the service role.`}
        actions={
          <Button asChild>
            <Link href="/admin/products/new">
              <Plus />
              New product
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <form className="flex flex-1 gap-2" action="/admin/products">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name or SKU…"
            className="h-9 min-w-40 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
          />
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
        </form>

        <div className="flex gap-1">
          {filters.map(([value, label]) => (
            <Link
              key={value}
              href={`/admin/products?status=${value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                (status ?? "all") === value
                  ? "bg-brand-600 text-white"
                  : "text-ink-soft hover:bg-surface-sunken"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Package size={30} />}
          title="No products match"
          description="Try a different search, or add your first product."
          action={
            <Button asChild>
              <Link href="/admin/products/new">Add a product</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-200 text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-3 py-3 font-medium">Category</th>
                <th className="px-3 py-3 text-right font-medium">Price</th>
                <th className="px-3 py-3 text-right font-medium">Margin</th>
                <th className="px-3 py-3 text-right font-medium">Stock</th>
                <th className="px-3 py-3 text-right font-medium">Sold</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => {
                const margin =
                  p.cost_paisa != null ? p.price_paisa - p.cost_paisa : null;
                const marginPct =
                  margin != null && p.price_paisa > 0
                    ? Math.round((margin / p.price_paisa) * 100)
                    : null;

                return (
                  <tr key={p.id} className="hover:bg-surface-sunken">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative size-9 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken">
                          {p.thumbnail_url ? (
                            <Image
                              src={p.thumbnail_url}
                              alt=""
                              fill
                              sizes="36px"
                              className="object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/products/${p.id}`}
                            className="clamp-2 font-medium text-ink hover:text-brand-700"
                          >
                            {p.name}
                          </Link>
                          <p className="text-[11px] text-ink-faint tabular">{p.sku}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-xs text-ink-muted">
                      {p.category_id ? categoryName.get(p.category_id) ?? "—" : "—"}
                    </td>

                    <td className="px-3 py-3 text-right tabular">
                      <span className="font-medium text-ink">
                        {formatTaka(p.price_paisa)}
                      </span>
                      {p.compare_at_paisa ? (
                        <span className="block text-[11px] text-ink-faint line-through">
                          {formatTaka(p.compare_at_paisa)}
                        </span>
                      ) : null}
                    </td>

                    <td className="px-3 py-3 text-right tabular">
                      {margin != null ? (
                        <>
                          <span
                            className={
                              margin > 0
                                ? "font-medium text-success"
                                : "font-medium text-danger"
                            }
                          >
                            {formatTaka(margin)}
                          </span>
                          <span className="block text-[11px] text-ink-faint">
                            {marginPct}%
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right tabular">
                      <span
                        className={
                          p.stock === 0
                            ? "font-semibold text-danger"
                            : p.stock <= p.low_stock_threshold
                              ? "font-semibold text-warning"
                              : "text-ink"
                        }
                      >
                        {p.stock}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-right tabular text-ink-muted">
                      {p.units_sold}
                    </td>

                    <td className="px-3 py-3">
                      <Badge
                        tone={
                          p.status === "active"
                            ? "success"
                            : p.status === "draft"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/admin/products/${p.id}`}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken hover:text-ink"
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil size={15} />
                        </Link>
                        <ProductStatusToggle id={p.id} status={p.status} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

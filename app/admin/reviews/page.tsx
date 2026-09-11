import Link from "next/link";
import { Star } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReviewModeration } from "@/components/admin/review-moderation";
import { PageHeader, EmptyState } from "@/components/ui/primitives";
import type { Review } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePermission("reviews");
  const { status } = await searchParams;
  const active = status ?? "pending";

  const db = createAdminClient();
  let query = db
    .from("reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (active !== "all") query = query.eq("status", active);

  const { data } = await query;
  const reviews = (data ?? []) as Review[];

  // Names and product titles in one round trip each, rather than per row.
  const [{ data: products }, { data: profiles }] = await Promise.all([
    reviews.length
      ? db
          .from("products")
          .select("id, name, slug")
          .in("id", reviews.map((r) => r.product_id))
      : Promise.resolve({ data: [] }),
    reviews.length
      ? db
          .from("profiles")
          .select("id, full_name, email")
          .in("id", reviews.map((r) => r.user_id))
      : Promise.resolve({ data: [] }),
  ]);

  const productById = new Map(
    ((products ?? []) as { id: string; name: string; slug: string }[]).map((p) => [
      p.id,
      p,
    ]),
  );
  const profileById = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  const tabs = [
    ["pending", "Pending"],
    ["approved", "Approved"],
    ["rejected", "Rejected"],
    ["all", "All"],
  ] as const;

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Approving a review immediately updates the product's rating — the rollup is a database trigger."
      />

      <div className="mb-4 flex flex-wrap gap-1">
        {tabs.map(([value, label]) => (
          <Link
            key={value}
            href={`/admin/reviews?status=${value}`}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
              active === value
                ? "bg-brand-600 text-white"
                : "text-ink-soft hover:bg-surface-sunken"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {reviews.length === 0 ? (
        <EmptyState
          icon={<Star size={30} />}
          title={active === "pending" ? "Nothing to moderate" : "No reviews here"}
          description="Customers can review a product once it has been delivered to them."
        />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <ReviewModeration
              key={r.id}
              review={r}
              productName={productById.get(r.product_id)?.name ?? "Unknown product"}
              productSlug={productById.get(r.product_id)?.slug ?? ""}
              authorName={
                profileById.get(r.user_id)?.full_name ??
                profileById.get(r.user_id)?.email ??
                "Customer"
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

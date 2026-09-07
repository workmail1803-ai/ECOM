import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CouponManager } from "@/components/admin/coupon-manager";
import { PageHeader } from "@/components/ui/primitives";
import type { Coupon } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  await requireStaff();
  const db = createAdminClient();

  const { data } = await db
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Validation happens inside quote_cart() — these rules are enforced in SQL, not in the checkout UI."
      />
      <CouponManager coupons={(data ?? []) as Coupon[]} />
    </>
  );
}

import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { BannerManager } from "@/components/admin/banner-manager";
import { PageHeader } from "@/components/ui/primitives";
import type { Banner } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminBannersPage() {
  await requireStaff();
  const db = createAdminClient();

  const { data } = await db
    .from("banners")
    .select("*")
    .order("placement")
    .order("priority", { ascending: false });

  return (
    <>
      <PageHeader
        title="Banners"
        description="Hero slides, the promo strip and the homepage offer cards all come from this table."
      />
      <BannerManager banners={(data ?? []) as Banner[]} />
    </>
  );
}

import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsForm } from "@/components/admin/settings-form";
import { DeliveryZoneManager } from "@/components/admin/delivery-zone-manager";
import { PageHeader } from "@/components/ui/primitives";
import type { DeliveryZone, Setting } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  // Full admins only. Managers get everything else, but not configuration —
  // the settings_admin_write policy enforces the same rule in SQL.
  await requireAdmin();
  const db = createAdminClient();

  const [{ data: settings }, { data: zones }] = await Promise.all([
    db.from("settings").select("*").order("key"),
    db.from("delivery_zones").select("*").order("position"),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Store configuration and delivery pricing. Nothing here is hardcoded in the app."
      />
      <SettingsForm settings={(settings ?? []) as Setting[]} />
      <div className="mt-6">
        <DeliveryZoneManager zones={(zones ?? []) as DeliveryZone[]} />
      </div>
    </>
  );
}

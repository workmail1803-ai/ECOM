import { requireAdmin } from "@/lib/auth/session";
import { getSiteTheme } from "@/lib/queries/theme";
import { DesignForm } from "@/components/admin/design-form";
import { PageHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * Admin-only, and deliberately not delegable to a manager with the `settings`
 * grant — restyling the entire storefront is not a section-level task.
 */
export default async function AdminDesignPage() {
  await requireAdmin();
  const theme = await getSiteTheme();

  return (
    <>
      <PageHeader
        title="Design"
        description="Colours, typeface and corner rounding for the whole storefront. Changes go live as soon as you save."
      />
      <DesignForm theme={theme} />
    </>
  );
}

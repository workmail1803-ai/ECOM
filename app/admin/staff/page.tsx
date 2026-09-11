import { requireAdmin } from "@/lib/auth/session";
import { listStaff } from "@/lib/queries/admin";
import { StaffManager } from "@/components/admin/staff-manager";
import { PageHeader, Card } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  // Admin-only and not delegable: whoever can grant access can grant themselves
  // anything, so this cannot be handed to a manager.
  const me = await requireAdmin();
  const staff = await listStaff();

  return (
    <>
      <PageHeader
        title="Staff & permissions"
        description="Give someone admin access and choose exactly which sections they can open."
      />

      <Card className="mb-4 border-brand-200 bg-brand-50/50 p-4">
        <h2 className="text-sm font-semibold text-ink">How access works</h2>
        <ul className="mt-2 space-y-1 text-sm leading-6 text-ink-soft">
          <li>
            <span className="font-semibold text-ink">Admin</span> — everything,
            including staff and settings. Cannot be restricted.
          </li>
          <li>
            <span className="font-semibold text-ink">Manager</span> — only the
            sections you tick below.
          </li>
          <li>
            <span className="font-semibold text-ink">Customer</span> — no admin
            access at all.
          </li>
        </ul>
        <p className="mt-2 text-xs text-ink-muted">
          The person must already have an account — ask them to sign up first, then
          add them by email. You cannot change your own access.
        </p>
      </Card>

      <StaffManager staff={staff} currentUserId={me.id} />
    </>
  );
}

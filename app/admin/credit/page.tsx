import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreditAccountsManager } from "@/components/admin/credit-accounts-manager";
import { PageHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * Credit accounts.
 *
 * Admin-only rather than a delegable section: extending credit decides how
 * much of the shop's money a customer may be holding at once.
 */
export default async function AdminCreditPage() {
  await requireAdmin();
  const db = createAdminClient();

  const [{ data: accounts }, { data: ledger }] = await Promise.all([
    db
      .from("credit_accounts")
      .select("phone, holder_name, limit_paisa, is_active, note, created_at")
      .order("created_at", { ascending: false }),
    db.from("credit_account_ledger").select("phone, delta_paisa"),
  ]);

  const rows = (accounts ?? []) as {
    phone: string;
    holder_name: string | null;
    limit_paisa: number;
    is_active: boolean;
    note: string | null;
    created_at: string;
  }[];

  // Outstanding is the sum of the ledger, which is zero or negative; flipping
  // the sign gives what the customer owes.
  const drawn = new Map<string, number>();
  for (const e of (ledger ?? []) as { phone: string; delta_paisa: number }[]) {
    drawn.set(e.phone, (drawn.get(e.phone) ?? 0) + e.delta_paisa);
  }

  return (
    <>
      <PageHeader
        title="Credit accounts"
        description="Regulars who may buy on account and settle later. Looked up at checkout by phone number."
      />
      <CreditAccountsManager
        accounts={rows.map((a) => ({
          ...a,
          outstandingPaisa: -(drawn.get(a.phone) ?? 0),
          availablePaisa: Math.max(0, a.limit_paisa + (drawn.get(a.phone) ?? 0)),
        }))}
      />
    </>
  );
}

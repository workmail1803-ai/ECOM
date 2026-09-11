import { Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CustomerRoleSelect } from "@/components/admin/customer-role-select";
import { PageHeader, Card, EmptyState, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatTaka } from "@/lib/utils/money";
import type { AppRole } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const staff = await requirePermission("customers");
  const { q } = await searchParams;

  const db = createAdminClient();

  let query = db
    .from("profiles")
    .select("id, full_name, email, phone, created_at, marketing_opt_in")
    .order("created_at", { ascending: false })
    .limit(200);

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data: profiles } = await query;
  const rows = (profiles ?? []) as {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    created_at: string;
    marketing_opt_in: boolean;
  }[];

  const [{ data: roles }, { data: orders }] = await Promise.all([
    rows.length
      ? db.from("user_roles").select("user_id, role").in("user_id", rows.map((r) => r.id))
      : Promise.resolve({ data: [] }),
    rows.length
      ? db
          .from("orders")
          .select("user_id, total_paisa, status")
          .in("user_id", rows.map((r) => r.id))
      : Promise.resolve({ data: [] }),
  ]);

  // Highest role wins, matching my_role() in migration 0007.
  const RANK: Record<AppRole, number> = { customer: 1, manager: 2, admin: 3 };
  const roleByUser = new Map<string, AppRole>();
  for (const r of (roles ?? []) as { user_id: string; role: AppRole }[]) {
    const current = roleByUser.get(r.user_id);
    if (!current || RANK[r.role] > RANK[current]) roleByUser.set(r.user_id, r.role);
  }

  const statsByUser = new Map<string, { count: number; spend: number }>();
  for (const o of (orders ?? []) as {
    user_id: string | null;
    total_paisa: number;
    status: string;
  }[]) {
    if (!o.user_id || o.status === "cancelled" || o.status === "returned") continue;
    const s = statsByUser.get(o.user_id) ?? { count: 0, spend: 0 };
    s.count += 1;
    s.spend += o.total_paisa;
    statsByUser.set(o.user_id, s);
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${rows.length} accounts. Only a full admin can change roles.`}
      />

      <Card className="mb-4 p-3">
        <form className="flex gap-2" action="/admin/customers">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name, email or phone…"
            className="h-9 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
          />
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users size={30} />}
          title="No customers found"
          description="Accounts appear here as soon as someone signs up."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-175 text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Phone</th>
                <th className="px-3 py-3 text-right font-medium">Orders</th>
                <th className="px-3 py-3 text-right font-medium">Spend</th>
                <th className="px-3 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => {
                const stats = statsByUser.get(c.id);
                const role = roleByUser.get(c.id) ?? "customer";

                return (
                  <tr key={c.id} className="hover:bg-surface-sunken">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">
                        {c.full_name ?? "—"}
                        {c.id === staff.id ? (
                          <Badge className="ml-1.5">You</Badge>
                        ) : null}
                      </p>
                      <p className="text-xs text-ink-muted">{c.email}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-muted tabular">
                      {c.phone ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular text-ink-muted">
                      {stats?.count ?? 0}
                    </td>
                    <td className="px-3 py-3 text-right tabular font-medium text-ink">
                      {formatTaka(stats?.spend ?? 0)}
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-muted">
                      {new Date(c.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <CustomerRoleSelect
                        userId={c.id}
                        role={role}
                        canEdit={staff.role === "admin" && c.id !== staff.id}
                      />
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

import { CustomerRoleSelect } from "@/components/admin/customer-role-select";
import { Badge } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";
import type { AdminCustomerRow } from "@/lib/queries/admin";

/**
 * Rows for the admin customer table.
 *
 * Shared between the first server-rendered page and the scroll-loaded ones,
 * so the markup exists once.
 */
export function CustomerRows({
  rows,
  staffId,
  staffIsAdmin,
}: {
  rows: AdminCustomerRow[];
  staffId: string;
  staffIsAdmin: boolean;
}) {
  return (
    <>
      {rows.map((c) => (
        <tr key={c.id} className="hover:bg-surface-sunken">
          <td className="px-4 py-3">
            <p className="font-medium text-ink">
              {c.full_name ?? "—"}
              {c.id === staffId ? <Badge className="ml-1.5">You</Badge> : null}
            </p>
            <p className="text-xs text-ink-muted">{c.email}</p>
          </td>
          <td className="px-3 py-3 text-xs text-ink-muted tabular">{c.phone ?? "—"}</td>
          <td className="px-3 py-3 text-right tabular text-ink-muted">
            {c.orderCount}
          </td>
          <td className="px-3 py-3 text-right tabular font-medium text-ink">
            {formatTaka(c.spendPaisa)}
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
              role={c.role}
              // Nobody edits their own role, including a full admin — that is
              // how you lock yourself out of your own store.
              canEdit={staffIsAdmin && c.id !== staffId}
            />
          </td>
        </tr>
      ))}
    </>
  );
}

import { Users } from "lucide-react";
import { listAdminCustomers } from "@/lib/queries/admin";
import { loadMoreAdminCustomers } from "@/lib/actions/admin-lists";
import { CustomerRows } from "@/components/admin/customer-rows";
import { LoadMoreRows } from "@/components/admin/load-more-rows";
import { PageHeader, Card, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  // The permission check lives inside the query — this page never assumes it.
  const { rows, total, nextPage, staff } = await listAdminCustomers({ q });

  const listQuery = new URLSearchParams(q ? { q } : {}).toString();

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${total} ${total === 1 ? "account" : "accounts"}. Only a full admin can change roles.`}
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
              <CustomerRows
                rows={rows}
                staffId={staff.id}
                staffIsAdmin={staff.role === "admin"}
              />
            </tbody>

            <LoadMoreRows
              action={loadMoreAdminCustomers}
              query={listQuery}
              initialNextPage={nextPage}
              colSpan={6}
            />
          </table>
        </Card>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Package, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABEL } from "@/components/checkout/order-timeline";
import { formatTaka } from "@/lib/utils/money";
import type { OrderStatus } from "@/types/database";

export const metadata: Metadata = { title: "My orders" };
export const dynamic = "force-dynamic";

const TONE: Record<OrderStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  placed: "neutral",
  confirmed: "brand",
  processing: "brand",
  shipped: "brand",
  out_for_delivery: "warning",
  delivered: "success",
  cancelled: "danger",
  returned: "warning",
};

export default async function OrdersPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_method, payment_status, total_paisa, placed_at, delivery_zone_name",
    )
    .eq("user_id", user.id)
    .order("placed_at", { ascending: false });

  const orders = data ?? [];

  // One extra query rather than a join, so the item thumbnails do not widen the
  // orders scan.
  const { data: items } = orders.length
    ? await supabase
        .from("order_items")
        .select("order_id, product_name, quantity")
        .in("order_id", orders.map((o) => o.id))
    : { data: [] };

  const itemsByOrder = new Map<string, { product_name: string; quantity: number }[]>();
  for (const it of items ?? []) {
    const list = itemsByOrder.get(it.order_id) ?? [];
    list.push(it);
    itemsByOrder.set(it.order_id, list);
  }

  return (
    <>
      <PageHeader title="My orders" description="Every order you have placed with us." />

      {orders.length === 0 ? (
        <EmptyState
          icon={<Package size={30} />}
          title="No orders yet"
          description="When you place an order it will show up here, with live tracking."
          action={
            <Button asChild>
              <Link href="/products">Start shopping</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const lines = itemsByOrder.get(o.id) ?? [];
            const summary = lines
              .slice(0, 2)
              .map((l) => `${l.quantity}× ${l.product_name}`)
              .join(", ");
            const more = lines.length > 2 ? ` +${lines.length - 2} more` : "";

            return (
              <Link key={o.id} href={`/account/orders/${o.id}`}>
                <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-lift">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold tabular text-ink">
                        {o.order_number}
                      </span>
                      <Badge tone={TONE[o.status as OrderStatus]}>
                        {ORDER_STATUS_LABEL[o.status as OrderStatus]}
                      </Badge>
                      {o.payment_method === "cod" && o.payment_status !== "successful" ? (
                        <Badge tone="warning">Pay on delivery</Badge>
                      ) : null}
                    </div>

                    <p className="clamp-2 mt-1 text-xs text-ink-muted">
                      {summary}
                      {more}
                    </p>

                    <p className="mt-1 text-xs text-ink-faint">
                      {new Date(o.placed_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}{" "}
                      · {o.delivery_zone_name}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-bold text-ink">
                      {formatTaka(o.total_paisa)}
                    </p>
                    <ChevronRight size={16} className="ml-auto mt-1 text-ink-faint" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

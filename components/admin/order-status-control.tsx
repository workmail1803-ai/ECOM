"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { OrderStatus } from "@/types/database";
import { updateOrderStatus } from "@/lib/actions/admin";
import { ORDER_STATUS_LABEL } from "@/components/checkout/order-timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/**
 * Status transitions.
 *
 * The allowed set mirrors `order_status_allowed()` in migration 0010, which is
 * the actual authority — a forged request still hits that check and fails. This
 * copy exists so the UI does not offer a button the database will reject.
 */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "cancelled", "returned"],
  out_for_delivery: ["delivered", "cancelled", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

export function OrderStatusControl({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const router = useRouter();
  const options = NEXT[status];

  function move(next: OrderStatus) {
    // Cancelling and returning both put stock back — worth a confirmation.
    if (
      (next === "cancelled" || next === "returned") &&
      !window.confirm(
        `Mark this order ${next}? Every item goes back into stock immediately.`,
      )
    ) {
      return;
    }

    start(async () => {
      const result = await updateOrderStatus(orderId, next, note || undefined);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update the order.");
        return;
      }
      toast.success(result.message ?? "Order updated.");
      setNote("");
      router.refresh();
    });
  }

  if (options.length === 0) {
    return (
      <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">
        This order is {ORDER_STATUS_LABEL[status].toLowerCase()} — no further
        transitions are possible.
      </p>
    );
  }

  return (
    <div>
      <p className="text-xs text-ink-muted">
        Currently <span className="font-medium text-ink">{ORDER_STATUS_LABEL[status]}</span>.
        Move it to:
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((next) => (
          <Button
            key={next}
            size="sm"
            variant={
              next === "cancelled" || next === "returned" ? "outline" : "primary"
            }
            loading={pending}
            onClick={() => move(next)}
            className={
              next === "cancelled" || next === "returned"
                ? "text-danger hover:bg-danger-soft"
                : undefined
            }
          >
            {ORDER_STATUS_LABEL[next]}
          </Button>
        ))}
      </div>

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note — shown to the customer on the tracking page"
        className="mt-3 h-9 text-sm"
        aria-label="Status change note"
      />
    </div>
  );
}

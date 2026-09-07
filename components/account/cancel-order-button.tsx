"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { XCircle } from "lucide-react";
import { cancelOrder } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

/**
 * Customer-side cancellation. `cancel_my_order()` enforces the real rule —
 * only while the order is still 'placed' or 'confirmed' — and puts the stock
 * back in the same transaction.
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function cancel() {
    start(async () => {
      const result = await cancelOrder(orderId, reason || undefined);
      if (!result.ok) {
        toast.error(result.error ?? "Could not cancel that order.");
        return;
      }
      toast.success(result.message ?? "Order cancelled.");
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <Button variant="outline" block onClick={() => setConfirming(true)}>
        <XCircle />
        Cancel this order
      </Button>
    );
  }

  return (
    <Card className="border-danger/25 p-4">
      <p className="text-sm font-medium text-ink">Cancel this order?</p>
      <p className="mt-1 text-xs text-ink-muted">
        The items go straight back into stock. This cannot be undone.
      </p>

      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        rows={2}
        className="mt-3 text-sm"
        aria-label="Cancellation reason"
      />

      <div className="mt-3 flex gap-2">
        <Button variant="danger" size="sm" loading={pending} onClick={cancel}>
          Yes, cancel
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Keep it
        </Button>
      </div>
    </Card>
  );
}

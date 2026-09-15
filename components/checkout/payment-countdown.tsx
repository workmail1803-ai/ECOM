"use client";

import { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";

/**
 * Time left to pay before the order is cancelled.
 *
 * Rendered from the server-stamped `payment_due_at`, and it only ever counts
 * DOWN to that instant — it does not decide anything. Whether an order is
 * actually expired is settled by `expire_unpaid_orders()` in SQL, so a clock
 * that is wrong on the visitor's device cannot cancel or save an order.
 */
export function PaymentCountdown({ dueAt }: { dueAt: string }) {
  // null until the first tick, so the server and the first client render
  // agree and React does not report a hydration mismatch.
  const [msLeft, setMsLeft] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(dueAt).getTime();
    const tick = () => setMsLeft(Math.max(0, end - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dueAt]);

  if (msLeft === null) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2.5 text-sm text-warning">
        <Clock size={15} className="shrink-0" />
        Checking how long you have to pay…
      </p>
    );
  }

  if (msLeft <= 0) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span>
          The payment window has passed. Reload the page — if this order has
          been cancelled, the items have gone back on sale and you will need to
          order again.
        </span>
      </p>
    );
  }

  const totalSeconds = Math.floor(msLeft / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const urgent = msLeft < 5 * 60 * 1000;

  return (
    <p
      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
        urgent
          ? "border-danger/20 bg-danger-soft text-danger"
          : "border-warning/20 bg-warning-soft text-warning"
      }`}
    >
      <Clock size={15} className="shrink-0" />
      <span>
        Pay within{" "}
        <strong className="font-semibold tabular">
          {minutes}:{String(seconds).padStart(2, "0")}
        </strong>{" "}
        or this order is cancelled automatically.
      </span>
    </p>
  );
}

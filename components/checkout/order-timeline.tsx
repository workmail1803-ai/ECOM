import { Check, X, Clock, RotateCcw } from "lucide-react";
import type { OrderStatus } from "@/types/database";
import { cn } from "@/lib/utils/cn";

/**
 * The happy path, in order. `cancelled` and `returned` are terminal states that
 * sit outside this sequence and are rendered separately.
 */
const FLOW: { status: OrderStatus; label: string; hint: string }[] = [
  { status: "placed", label: "Order placed", hint: "We have your order" },
  { status: "confirmed", label: "Confirmed", hint: "Stock reserved for you" },
  { status: "processing", label: "Processing", hint: "Being packed" },
  { status: "shipped", label: "Shipped", hint: "Handed to the courier" },
  { status: "out_for_delivery", label: "Out for delivery", hint: "Arriving today" },
  { status: "delivered", label: "Delivered", hint: "Enjoy it" },
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Order placed",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export function OrderTimeline({
  status,
  history,
}: {
  status: OrderStatus;
  history?: { status: OrderStatus; note: string | null; created_at: string }[];
}) {
  if (status === "cancelled" || status === "returned") {
    const cancelled = status === "cancelled";
    const entry = history?.find((h) => h.status === status);

    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-4",
          cancelled
            ? "border-danger/20 bg-danger-soft"
            : "border-warning/20 bg-warning-soft",
        )}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-white",
            cancelled ? "bg-danger" : "bg-warning",
          )}
        >
          {cancelled ? <X size={17} /> : <RotateCcw size={17} />}
        </span>
        <div>
          <p
            className={cn(
              "text-sm font-semibold",
              cancelled ? "text-danger" : "text-warning",
            )}
          >
            {ORDER_STATUS_LABEL[status]}
          </p>
          {entry?.note ? (
            <p className="mt-0.5 text-sm text-ink-soft">{entry.note}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-ink-muted">
            Any reserved stock has been released.
          </p>
        </div>
      </div>
    );
  }

  const currentIndex = FLOW.findIndex((s) => s.status === status);
  const timeByStatus = new Map(
    (history ?? []).map((h) => [h.status, h.created_at] as const),
  );

  return (
    <ol className="relative">
      {FLOW.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const at = timeByStatus.get(step.status);

        return (
          <li key={step.status} className="flex gap-3 pb-6 last:pb-0">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  done && "border-success bg-success text-white",
                  active && "border-brand-600 bg-brand-600 text-white",
                  !done && !active && "border-line bg-surface text-ink-faint",
                )}
              >
                {done ? (
                  <Check size={15} />
                ) : active ? (
                  <Clock size={15} />
                ) : (
                  <span className="size-2 rounded-full bg-current" />
                )}
              </span>
              {i < FLOW.length - 1 ? (
                <span
                  className={cn(
                    "mt-1 w-0.5 flex-1 rounded",
                    done ? "bg-success" : "bg-line",
                  )}
                  style={{ minHeight: 24 }}
                />
              ) : null}
            </div>

            <div className="pt-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  active ? "text-brand-700" : done ? "text-ink" : "text-ink-faint",
                )}
              >
                {step.label}
              </p>
              <p className="text-xs text-ink-muted">
                {at
                  ? new Date(at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : step.hint}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Ticket } from "lucide-react";
import type { Coupon } from "@/types/database";
import { saveCoupon, toggleCoupon, type AdminState } from "@/lib/actions/admin";
import { formatTaka, paisaToTaka } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/field";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";

const initial: AdminState = { ok: false };

/** `YYYY-MM-DDTHH:mm` for a datetime-local input. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CouponManager({ coupons }: { coupons: Coupon[] }) {
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function toggle(c: Coupon) {
    start(async () => {
      const result = await toggleCoupon(c.id, !c.is_active);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(c.is_active ? "Coupon paused." : "Coupon activated.");
      router.refresh();
    });
  }

  const showForm = adding || editing !== null;

  return (
    <>
      {showForm ? (
        <CouponForm
          coupon={editing}
          onDone={() => {
            setAdding(false);
            setEditing(null);
            router.refresh();
          }}
          onCancel={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      ) : (
        <Button onClick={() => setAdding(true)} className="mb-4">
          <Plus />
          New coupon
        </Button>
      )}

      {coupons.length === 0 && !showForm ? (
        <EmptyState
          icon={<Ticket size={30} />}
          title="No coupons yet"
          description="Create a code and it becomes usable at checkout immediately."
        />
      ) : (
        <Card className="mt-4 overflow-x-auto">
          <table className="w-full min-w-200 text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-3 py-3 font-medium">Discount</th>
                <th className="px-3 py-3 text-right font-medium">Min order</th>
                <th className="px-3 py-3 text-right font-medium">Used</th>
                <th className="px-3 py-3 font-medium">Window</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {coupons.map((c) => {
                const expired =
                  c.expires_at != null && new Date(c.expires_at) < new Date();
                const exhausted =
                  c.usage_limit != null && c.used_count >= c.usage_limit;

                return (
                  <tr key={c.id} className="hover:bg-surface-sunken">
                    <td className="px-4 py-3">
                      <p className="font-semibold tabular text-ink">{c.code}</p>
                      {c.description ? (
                        <p className="clamp-2 text-[11px] text-ink-muted">
                          {c.description}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-3 py-3 tabular">
                      {c.discount_type === "percentage"
                        ? `${c.discount_value}%`
                        : formatTaka(c.discount_value)}
                      {c.max_discount_paisa ? (
                        <span className="block text-[11px] text-ink-muted">
                          max {formatTaka(c.max_discount_paisa)}
                        </span>
                      ) : null}
                    </td>

                    <td className="px-3 py-3 text-right tabular text-ink-muted">
                      {c.min_order_paisa ? formatTaka(c.min_order_paisa) : "—"}
                    </td>

                    <td className="px-3 py-3 text-right tabular text-ink-muted">
                      {c.used_count}
                      {c.usage_limit ? ` / ${c.usage_limit}` : ""}
                    </td>

                    <td className="px-3 py-3 text-[11px] text-ink-muted">
                      {c.expires_at
                        ? `Until ${new Date(c.expires_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}`
                        : "No expiry"}
                    </td>

                    <td className="px-3 py-3">
                      <Badge
                        tone={
                          !c.is_active
                            ? "neutral"
                            : expired || exhausted
                              ? "danger"
                              : "success"
                        }
                      >
                        {!c.is_active
                          ? "Paused"
                          : expired
                            ? "Expired"
                            : exhausted
                              ? "Used up"
                              : "Live"}
                      </Badge>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditing(c);
                            setAdding(false);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken hover:text-ink"
                          aria-label={`Edit ${c.code}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => toggle(c)}
                        >
                          {c.is_active ? "Pause" : "Activate"}
                        </Button>
                      </div>
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

function CouponForm({
  coupon,
  onDone,
  onCancel,
}: {
  coupon: Coupon | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(saveCoupon, initial);
  const [type, setType] = useState(coupon?.discount_type ?? "percentage");

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-ink">
        {coupon ? `Edit ${coupon.code}` : "New coupon"}
      </h2>

      <form action={action} className="mt-4 space-y-4">
        {coupon ? <input type="hidden" name="id" value={coupon.id} /> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Code" htmlFor="code" required error={state.fieldErrors?.code}>
            <Input
              id="code"
              name="code"
              required
              defaultValue={coupon?.code ?? ""}
              placeholder="EIDGIFT"
              className="uppercase tabular"
            />
          </Field>

          <Field label="Type" htmlFor="discount_type" required>
            <Select
              id="discount_type"
              name="discount_type"
              value={type}
              onChange={(e) => setType(e.target.value as "percentage" | "fixed")}
            >
              <option value="percentage">Percentage off</option>
              <option value="fixed">Fixed taka off</option>
            </Select>
          </Field>

          <Field
            label={type === "percentage" ? "Percent off" : "Taka off"}
            htmlFor="discount_value"
            required
            error={state.fieldErrors?.discount_value}
          >
            <Input
              id="discount_value"
              name="discount_value"
              type="number"
              step={type === "percentage" ? "1" : "0.01"}
              min="1"
              max={type === "percentage" ? 100 : undefined}
              required
              defaultValue={
                coupon
                  ? coupon.discount_type === "percentage"
                    ? coupon.discount_value
                    : paisaToTaka(coupon.discount_value)
                  : ""
              }
              invalid={Boolean(state.fieldErrors?.discount_value)}
            />
          </Field>

          <Field label="Minimum order (৳)" htmlFor="min_order">
            <Input
              id="min_order"
              name="min_order"
              type="number"
              step="0.01"
              min="0"
              defaultValue={paisaToTaka(coupon?.min_order_paisa ?? 0)}
            />
          </Field>

          <Field
            label="Maximum discount (৳)"
            htmlFor="max_discount"
            hint="Caps a percentage coupon"
          >
            <Input
              id="max_discount"
              name="max_discount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={paisaToTaka(coupon?.max_discount_paisa)}
            />
          </Field>

          <Field label="Description" htmlFor="description">
            <Input
              id="description"
              name="description"
              defaultValue={coupon?.description ?? ""}
              placeholder="7% off with no minimum"
            />
          </Field>

          <Field label="Starts" htmlFor="starts_at">
            <Input
              id="starts_at"
              name="starts_at"
              type="datetime-local"
              defaultValue={toLocalInput(coupon?.starts_at ?? null)}
            />
          </Field>

          <Field label="Expires" htmlFor="expires_at">
            <Input
              id="expires_at"
              name="expires_at"
              type="datetime-local"
              defaultValue={toLocalInput(coupon?.expires_at ?? null)}
            />
          </Field>

          <Field label="Total uses" htmlFor="usage_limit" hint="Blank = unlimited">
            <Input
              id="usage_limit"
              name="usage_limit"
              type="number"
              min="1"
              defaultValue={coupon?.usage_limit ?? ""}
            />
          </Field>

          <Field label="Uses per customer" htmlFor="per_user_limit">
            <Input
              id="per_user_limit"
              name="per_user_limit"
              type="number"
              min="1"
              defaultValue={coupon?.per_user_limit ?? 1}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={coupon?.is_active ?? true}
            className="size-4 accent-brand-600"
          />
          Active
        </label>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" loading={pending}>
            {coupon ? "Save changes" : "Create coupon"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

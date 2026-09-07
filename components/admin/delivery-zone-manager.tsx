"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Truck } from "lucide-react";
import type { DeliveryZone } from "@/types/database";
import { saveDeliveryZone, type AdminState } from "@/lib/actions/admin";
import { formatTaka, paisaToTaka } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/field";
import { Card, Badge } from "@/components/ui/primitives";

const initial: AdminState = { ok: false };

/**
 * Delivery pricing.
 *
 * `resolve_delivery_zone()` matches an order's district against these
 * `districts` arrays, falling back to the zone flagged `is_fallback`. Change a
 * fee here and every subsequent quote uses it — no deploy, no code change.
 */
export function DeliveryZoneManager({ zones }: { zones: DeliveryZone[] }) {
  const [editing, setEditing] = useState<DeliveryZone | null>(null);
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  const showForm = adding || editing !== null;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Delivery zones</h2>
          <p className="text-xs text-ink-muted">
            Districts not listed anywhere fall through to the fallback zone.
          </p>
        </div>
        {!showForm ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus size={14} />
            New zone
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <ZoneForm
          zone={editing}
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
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {zones.map((z) => (
          <Card key={z.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-ink">{z.name}</h3>
                  {z.is_fallback ? <Badge tone="brand">Fallback</Badge> : null}
                  <Badge tone={z.is_active ? "success" : "neutral"}>
                    {z.is_active ? "Active" : "Off"}
                  </Badge>
                </div>

                <p className="mt-1 text-sm tabular text-ink-soft">
                  {formatTaka(z.fee_paisa)} · {z.min_days}–{z.max_days} days
                </p>
                {z.free_above_paisa ? (
                  <p className="text-xs text-success">
                    Free above {formatTaka(z.free_above_paisa)}
                  </p>
                ) : (
                  <p className="text-xs text-ink-faint">No free-delivery threshold</p>
                )}

                <p className="clamp-2 mt-1.5 text-[11px] text-ink-muted">
                  {z.districts.length > 0
                    ? z.districts.join(", ")
                    : "Everything not matched by another zone"}
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => {
                setEditing(z);
                setAdding(false);
              }}
            >
              <Pencil size={14} />
              Edit
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}

function ZoneForm({
  zone,
  onDone,
  onCancel,
}: {
  zone: DeliveryZone | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(saveDeliveryZone, initial);

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Truck size={15} />
        {zone ? `Edit ${zone.name}` : "New delivery zone"}
      </h3>

      <form action={action} className="mt-4 space-y-4">
        {zone ? <input type="hidden" name="id" value={zone.id} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Zone name" htmlFor="zone_name" required>
            <Input id="zone_name" name="name" required defaultValue={zone?.name ?? ""} />
          </Field>

          <Field label="Slug" htmlFor="zone_slug" hint="Blank generates from the name">
            <Input id="zone_slug" name="slug" defaultValue={zone?.slug ?? ""} />
          </Field>

          <Field label="Delivery fee (৳)" htmlFor="fee" required>
            <Input
              id="fee"
              name="fee"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={paisaToTaka(zone?.fee_paisa ?? 0)}
            />
          </Field>

          <Field
            label="Free above (৳)"
            htmlFor="free_above"
            hint="Blank = never free"
          >
            <Input
              id="free_above"
              name="free_above"
              type="number"
              step="0.01"
              min="0"
              defaultValue={paisaToTaka(zone?.free_above_paisa)}
            />
          </Field>

          <Field label="Minimum days" htmlFor="min_days" required>
            <Input
              id="min_days"
              name="min_days"
              type="number"
              min="1"
              required
              defaultValue={zone?.min_days ?? 1}
            />
          </Field>

          <Field label="Maximum days" htmlFor="max_days" required>
            <Input
              id="max_days"
              name="max_days"
              type="number"
              min="1"
              required
              defaultValue={zone?.max_days ?? 3}
            />
          </Field>

          <Field
            label="Districts"
            htmlFor="districts"
            hint="Comma separated. Leave blank for the fallback zone."
            className="sm:col-span-2"
          >
            <Textarea
              id="districts"
              name="districts"
              rows={2}
              defaultValue={zone?.districts.join(", ") ?? ""}
              placeholder="Dhaka, Gazipur, Narayanganj"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={zone?.is_active ?? true}
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
            {zone ? "Save zone" : "Create zone"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MapPin, Star } from "lucide-react";
import type { Address } from "@/types/database";
import { saveAddress, deleteAddress, type ActionState } from "@/lib/actions/account";
import { BD_DISTRICTS } from "@/lib/utils/districts";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/field";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";

const initial: ActionState = { ok: false };

export function AddressManager({ addresses }: { addresses: Address[] }) {
  const [editing, setEditing] = useState<Address | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function remove(id: string) {
    start(async () => {
      const result = await deleteAddress(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete that address.");
        return;
      }
      toast.success("Address removed.");
      router.refresh();
    });
  }

  const showForm = adding || editing !== null;

  return (
    <>
      {!showForm ? (
        <Button onClick={() => setAdding(true)} className="mb-4">
          <Plus />
          Add an address
        </Button>
      ) : (
        <AddressForm
          address={editing}
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
      )}

      {addresses.length === 0 && !showForm ? (
        <EmptyState
          icon={<MapPin size={30} />}
          title="No saved addresses"
          description="Save one now, or tick “save this address” at checkout."
        />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-ink">{a.recipient_name}</p>
                    {a.is_default ? (
                      <Badge tone="brand">
                        <Star size={10} />
                        Default
                      </Badge>
                    ) : null}
                    {a.label ? <Badge>{a.label}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{a.phone}</p>
                  <p className="mt-0.5 text-sm leading-5 text-ink-muted">
                    {a.street}, {a.area}
                    <br />
                    {a.district}
                    {a.postcode ? ` ${a.postcode}` : ""}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(a);
                    setAdding(false);
                  }}
                >
                  <Pencil size={14} />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => remove(a.id)}
                  className="text-ink-muted hover:text-danger"
                >
                  <Trash2 size={14} />
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function AddressForm({
  address,
  onDone,
  onCancel,
}: {
  address: Address | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(saveAddress, initial);

  if (state.ok && state.message) {
    // Fires once per successful submit; the parent re-fetches the list.
    queueMicrotask(onDone);
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-ink">
        {address ? "Edit address" : "New address"}
      </h2>

      <form action={action} className="mt-4 space-y-4">
        {address ? <input type="hidden" name="id" value={address.id} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label" htmlFor="label" hint="Home, Office…">
            <Input id="label" name="label" defaultValue={address?.label ?? ""} />
          </Field>

          <Field
            label="Recipient name"
            htmlFor="recipient_name"
            required
            error={state.fieldErrors?.recipient_name}
          >
            <Input
              id="recipient_name"
              name="recipient_name"
              required
              defaultValue={address?.recipient_name ?? ""}
            />
          </Field>

          <Field
            label="Mobile number"
            htmlFor="phone"
            required
            error={state.fieldErrors?.phone}
          >
            <Input
              id="phone"
              name="phone"
              required
              inputMode="numeric"
              placeholder="01XXXXXXXXX"
              defaultValue={address?.phone ?? ""}
            />
          </Field>

          <Field
            label="District"
            htmlFor="district"
            required
            error={state.fieldErrors?.district}
          >
            <Select
              id="district"
              name="district"
              required
              defaultValue={address?.district ?? ""}
            >
              <option value="">Select a district</option>
              {BD_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Area / thana" htmlFor="area" required error={state.fieldErrors?.area}>
            <Input id="area" name="area" required defaultValue={address?.area ?? ""} />
          </Field>

          <Field label="Postcode" htmlFor="postcode">
            <Input id="postcode" name="postcode" defaultValue={address?.postcode ?? ""} />
          </Field>

          <Field
            label="House & road"
            htmlFor="street"
            required
            className="sm:col-span-2"
            error={state.fieldErrors?.street}
          >
            <Input
              id="street"
              name="street"
              required
              defaultValue={address?.street ?? ""}
            />
          </Field>

          <Field label="Landmark" htmlFor="landmark" className="sm:col-span-2">
            <Input id="landmark" name="landmark" defaultValue={address?.landmark ?? ""} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="is_default"
            defaultChecked={address?.is_default ?? false}
            className="size-4 accent-brand-600"
          />
          Use this as my default address
        </label>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" loading={pending}>
            {address ? "Save changes" : "Add address"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

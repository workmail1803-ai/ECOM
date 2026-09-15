"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2, Plus, Package, Layers } from "lucide-react";
import {
  saveQuantityBreak,
  deleteQuantityBreak,
  saveBundle,
  deleteBundle,
  type AdminState,
} from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/primitives";
import { formatTaka } from "@/lib/utils/money";

const initial: AdminState = { ok: false };

export interface PickerProduct {
  id: string;
  name: string;
  price_paisa: number;
}
export interface PickerCategory {
  id: string;
  name: string;
}

export interface BreakRow {
  id: string;
  min_quantity: number;
  discount_percent: number;
  target: string;
  scope: "product" | "category";
}

export interface BundleRow {
  id: string;
  name: string;
  discount_percent: number;
  products: string[];
}

/**
 * The two promotion shapes in one screen, because an operator thinks of them
 * together: "how do I discount this?" — by volume, or by combination.
 */
export function PromotionsManager({
  breaks,
  bundles,
  products,
  categories,
}: {
  breaks: BreakRow[];
  bundles: BundleRow[];
  products: PickerProduct[];
  categories: PickerCategory[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <QuantityBreaks rows={breaks} products={products} categories={categories} />
      <Bundles rows={bundles} products={products} />
    </div>
  );
}

function QuantityBreaks({
  rows,
  products,
  categories,
}: {
  rows: BreakRow[];
  products: PickerProduct[];
  categories: PickerCategory[];
}) {
  const [state, action, pending] = useActionState(saveQuantityBreak, initial);
  const [scope, setScope] = useState<"product" | "category">("product");
  const [removing, startRemove] = useTransition();

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Package size={16} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-ink">Buy more, save more</h2>
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">
        Buy N or more and that line is discounted. A rule on a product beats a
        rule on its category.
      </p>

      <form action={action} className="mt-4 space-y-3">
        <div className="flex gap-2">
          {(["product", "category"] as const).map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm capitalize text-ink">
              <input
                type="radio"
                name="scope"
                value={s}
                checked={scope === s}
                onChange={() => setScope(s)}
                className="size-4 accent-brand-600"
              />
              {s}
            </label>
          ))}
        </div>

        <select
          name="target_id"
          required
          className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
        >
          <option value="">
            {scope === "product" ? "Choose a product…" : "Choose a category…"}
          </option>
          {(scope === "product" ? products : categories).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">
              Minimum quantity
            </span>
            <input
              name="min_quantity"
              type="number"
              min={2}
              defaultValue={3}
              required
              className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">
              Discount %
            </span>
            <input
              name="discount_percent"
              type="number"
              min={1}
              max={90}
              step={0.5}
              defaultValue={10}
              required
              className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
            />
          </label>
        </div>

        <Button type="submit" size="sm" loading={pending}>
          <Plus size={15} />
          Add rule
        </Button>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : state.ok && state.message ? (
          <p className="text-sm text-success">{state.message}</p>
        ) : null}
      </form>

      <div className="mt-5 border-t border-line pt-4">
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">No quantity rules yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{r.target}</span>
                  <span className="text-xs text-ink-muted">
                    {r.scope === "category" ? "Category · " : ""}
                    Buy {r.min_quantity}+ · {r.discount_percent}% off
                  </span>
                </span>
                <button
                  type="button"
                  disabled={removing}
                  onClick={() => startRemove(async () => void (await deleteQuantityBreak(r.id)))}
                  className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-danger-soft hover:text-danger"
                  aria-label={`Remove rule for ${r.target}`}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Bundles({ rows, products }: { rows: BundleRow[]; products: PickerProduct[] }) {
  const [state, action, pending] = useActionState(saveBundle, initial);
  const [picked, setPicked] = useState<string[]>([]);
  const [removing, startRemove] = useTransition();

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Layers size={16} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-ink">Bundle offers</h2>
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">
        Hold every product in the set and the set is discounted. The cut comes
        off those lines only.
      </p>

      <form action={action} className="mt-4 space-y-3">
        <input
          name="name"
          required
          placeholder="e.g. Desk Starter Pack"
          className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
        />

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-muted">
            Discount % off the bundle
          </span>
          <input
            name="discount_percent"
            type="number"
            min={1}
            max={90}
            step={0.5}
            defaultValue={10}
            required
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-600 focus:outline-none"
          />
        </label>

        <div className="max-h-52 overflow-y-auto rounded-lg border border-line p-2">
          {products.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-sunken"
            >
              <input
                type="checkbox"
                name="product_ids"
                value={p.id}
                checked={picked.includes(p.id)}
                onChange={() => toggle(p.id)}
                className="size-4 shrink-0 accent-brand-600"
              />
              <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
              <span className="shrink-0 text-xs tabular text-ink-muted">
                {formatTaka(p.price_paisa)}
              </span>
            </label>
          ))}
        </div>

        <Button type="submit" size="sm" loading={pending} disabled={picked.length < 2}>
          <Plus size={15} />
          Create bundle{picked.length ? ` (${picked.length})` : ""}
        </Button>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : state.ok && state.message ? (
          <p className="text-sm text-success">{state.message}</p>
        ) : null}
      </form>

      <div className="mt-5 border-t border-line pt-4">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Layers size={26} />}
            title="No bundles yet"
            description="Pick two or more products above to make one."
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((b) => (
              <li
                key={b.id}
                className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">
                    {b.name} · {b.discount_percent}% off
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {b.products.join(" + ")}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={removing}
                  onClick={() => startRemove(async () => void (await deleteBundle(b.id)))}
                  className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-danger-soft hover:text-danger"
                  aria-label={`Remove ${b.name}`}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

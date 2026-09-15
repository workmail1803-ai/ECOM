"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveProduct, type AdminState } from "@/lib/actions/admin";
import { paisaToTaka } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";
import type { Brand, Category, ProductAdmin, SpecItem } from "@/types/database";

const initial: AdminState = { ok: false };

/**
 * Product create/edit.
 *
 * Prices are typed in TAKA and converted to paisa server-side by
 * `takaToPaisa()` — an operator should never have to think in paisa, and the
 * browser should never be the thing doing the conversion that reaches the
 * database.
 */
export function ProductForm({
  product,
  categories,
  brands,
}: {
  product: ProductAdmin | null;
  categories: Category[];
  brands: Brand[];
}) {
  const [state, action, pending] = useActionState(saveProduct, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      router.push("/admin/products");
    }
  }, [state, router]);

  const specsText = ((product?.specifications ?? []) as SpecItem[])
    .map((s) => `${s.label}: ${s.value}`)
    .join("\n");

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1fr_320px]">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Basics</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Product name"
              htmlFor="name"
              required
              className="sm:col-span-2"
              error={state.fieldErrors?.name}
            >
              <Input
                id="name"
                name="name"
                required
                defaultValue={product?.name ?? ""}
                placeholder="Anker PowerCore 20,000mAh Power Bank"
                invalid={Boolean(state.fieldErrors?.name)}
              />
            </Field>

            <Field
              label="Slug"
              htmlFor="slug"
              hint="Leave blank to generate from the name"
              error={state.fieldErrors?.slug}
            >
              <Input id="slug" name="slug" defaultValue={product?.slug ?? ""} />
            </Field>

            <Field label="SKU" htmlFor="sku" required error={state.fieldErrors?.sku}>
              <Input
                id="sku"
                name="sku"
                required
                defaultValue={product?.sku ?? ""}
                invalid={Boolean(state.fieldErrors?.sku)}
              />
            </Field>

            <Field label="Category" htmlFor="category_id">
              <Select
                id="category_id"
                name="category_id"
                defaultValue={product?.category_id ?? ""}
              >
                <option value="">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Brand" htmlFor="brand_id">
              <Select id="brand_id" name="brand_id" defaultValue={product?.brand_id ?? ""}>
                <option value="">No brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Short description"
              htmlFor="short_description"
              hint="One line, shown on cards and under the title"
              className="sm:col-span-2"
            >
              <Input
                id="short_description"
                name="short_description"
                maxLength={400}
                defaultValue={product?.short_description ?? ""}
              />
            </Field>

            <Field label="Full description" htmlFor="description" className="sm:col-span-2">
              <Textarea
                id="description"
                name="description"
                rows={7}
                defaultValue={product?.description ?? ""}
                placeholder="Blank lines become paragraphs on the product page."
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Pricing & stock</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Enter taka. Cost is staff-only and never leaves the server.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field
              label="Selling price (৳)"
              htmlFor="price"
              required
              error={state.fieldErrors?.price}
            >
              <Input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min="0.01"
                required
                defaultValue={paisaToTaka(product?.price_paisa)}
                invalid={Boolean(state.fieldErrors?.price)}
              />
            </Field>

            <Field
              label="Compare-at (৳)"
              htmlFor="compare_at"
              hint="Struck-through price"
              error={state.fieldErrors?.compare_at}
            >
              <Input
                id="compare_at"
                name="compare_at"
                type="number"
                step="0.01"
                min="0"
                defaultValue={paisaToTaka(product?.compare_at_paisa)}
                invalid={Boolean(state.fieldErrors?.compare_at)}
              />
            </Field>

            <Field label="Your cost (৳)" htmlFor="cost" hint="Drives the margin report">
              <Input
                id="cost"
                name="cost"
                type="number"
                step="0.01"
                min="0"
                defaultValue={paisaToTaka(product?.cost_paisa)}
              />
            </Field>

            <Field label="Stock" htmlFor="stock" required>
              <Input
                id="stock"
                name="stock"
                type="number"
                min="0"
                required
                defaultValue={product?.stock ?? 0}
              />
            </Field>

            <Field label="Low-stock alert at" htmlFor="low_stock_threshold">
              <Input
                id="low_stock_threshold"
                name="low_stock_threshold"
                type="number"
                min="0"
                defaultValue={product?.low_stock_threshold ?? 5}
              />
            </Field>

            <Field
              label="Reward points"
              htmlFor="points_per_purchase"
              hint="Points a customer earns per unit, once the order is delivered"
            >
              <Input
                id="points_per_purchase"
                name="points_per_purchase"
                type="number"
                min="0"
                defaultValue={product?.points_per_purchase ?? 0}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Details</h2>

          <div className="mt-4 space-y-4">
            <Field
              label="Key features"
              htmlFor="features"
              hint="One per line — rendered as a ticked list"
            >
              <Textarea
                id="features"
                name="features"
                rows={5}
                defaultValue={(product?.features ?? []).join("\n")}
                placeholder={"22.5W fast charging\nGenuine 20,000mAh cells"}
              />
            </Field>

            <Field
              label="Specifications"
              htmlFor="specifications"
              hint="One per line, as “Label: value”"
            >
              <Textarea
                id="specifications"
                name="specifications"
                rows={6}
                defaultValue={specsText}
                placeholder={"Capacity: 20,000mAh\nOutput: 22.5W"}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Warranty" htmlFor="warranty">
                <Input
                  id="warranty"
                  name="warranty"
                  defaultValue={product?.warranty ?? ""}
                  placeholder="1 year official warranty"
                />
              </Field>

              <Field label="Delivery note" htmlFor="delivery_note">
                <Input
                  id="delivery_note"
                  name="delivery_note"
                  defaultValue={product?.delivery_note ?? ""}
                  placeholder="Bulky item — standard zone rate"
                />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Publishing</h2>

          <Field label="Status" htmlFor="status" className="mt-3">
            <Select id="status" name="status" defaultValue={product?.status ?? "draft"}>
              <option value="draft">Draft — hidden from the shop</option>
              <option value="active">Active — live on the storefront</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>

          <div className="mt-4 space-y-2.5">
            {[
              ["is_featured", "Featured", product?.is_featured],
              ["is_new_arrival", "New arrival", product?.is_new_arrival],
              ["is_best_seller", "Best seller", product?.is_best_seller],
            ].map(([name, label, checked]) => (
              <label
                key={String(name)}
                className="flex items-center gap-2 text-sm text-ink-soft"
              >
                <input
                  type="checkbox"
                  name={String(name)}
                  defaultChecked={Boolean(checked)}
                  className="size-4 accent-brand-600"
                />
                {String(label)}
              </label>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Media</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Paste an image URL, or upload to the product-images bucket in Supabase
            Storage and paste the public URL.
          </p>

          <Field label="Thumbnail URL" htmlFor="thumbnail_url" className="mt-3">
            <Input
              id="thumbnail_url"
              name="thumbnail_url"
              type="url"
              defaultValue={product?.thumbnail_url ?? ""}
              placeholder="https://…"
            />
          </Field>

          <Field label="Video embed URL" htmlFor="video_url" className="mt-3">
            <Input
              id="video_url"
              name="video_url"
              type="url"
              defaultValue={product?.video_url ?? ""}
              placeholder="https://www.youtube.com/embed/…"
            />
          </Field>
        </Card>

        {state.error ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {state.error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" loading={pending} block>
            {product ? "Save changes" : "Create product"}
          </Button>
        </div>
      </aside>
    </form>
  );
}

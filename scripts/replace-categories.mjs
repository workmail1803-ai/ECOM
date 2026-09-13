#!/usr/bin/env node
/**
 * Swap the live category taxonomy for the one in catalog-data.mjs.
 *
 *   node scripts/replace-categories.mjs --dry    # report, change nothing
 *   node scripts/replace-categories.mjs          # apply
 *
 * Ordering matters and is the whole point of this script existing rather than
 * a hand-run of the seeder:
 *
 *   1. upsert the new categories, so their ids exist;
 *   2. repoint every product at its new category;
 *   3. repoint banner / category-tile links at the new slugs;
 *   4. only then delete the categories nobody references any more.
 *
 * `products.category_id` is ON DELETE SET NULL, so deleting first would
 * silently uncategorise the catalogue instead of failing loudly. Products are
 * matched by SLUG, never by category, so a product an operator has already
 * re-filed by hand in /admin keeps whatever they chose.
 *
 * Re-running is safe: upserts are by slug and the remap is idempotent.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, PRODUCTS } from "./catalog-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");

for (const file of [".env.local", ".env"]) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const rest = async (path, init = {}) => {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: init.method === "POST" ? "resolution=merge-duplicates,return=representation" : "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
};

const wanted = new Set(CATEGORIES.map((c) => c.slug));
const before = await rest("categories?select=id,slug,name&order=position");
const stale = before.filter((c) => !wanted.has(c.slug));

console.log(`live categories : ${before.length}`);
console.log(`target          : ${CATEGORIES.length}`);
console.log(`to remove       : ${stale.length}${stale.length ? " — " + stale.map((c) => c.slug).join(", ") : ""}`);

if (DRY) {
  console.log("\n--dry: nothing written.");
  process.exit(0);
}

// 1. Upsert the target taxonomy.
const saved = await rest("categories?on_conflict=slug", {
  method: "POST",
  body: JSON.stringify(CATEGORIES.map((c) => ({ ...c, is_active: true }))),
});
const idBySlug = Object.fromEntries(saved.map((c) => [c.slug, c.id]));
console.log(`upserted        : ${saved.length}`);

// 2. Repoint products, one PATCH per target category rather than per product.
const bySlug = {};
for (const p of PRODUCTS) (bySlug[p.category] ??= []).push(p.slug);

let moved = 0;
for (const [cat, slugs] of Object.entries(bySlug)) {
  const id = idBySlug[cat];
  if (!id) {
    console.warn(`  ! no category for ${cat}, skipped ${slugs.length} product(s)`);
    continue;
  }
  const list = slugs.map((s) => `"${s}"`).join(",");
  const rows = await rest(`products?slug=in.(${list})&select=id`, {
    method: "PATCH",
    body: JSON.stringify({ category_id: id }),
  });
  moved += rows.length;
}
console.log(`products moved  : ${moved}`);

// 3. Repoint banner links that still name a removed slug.
let banners = 0;
for (const c of stale) {
  const rows = await rest(
    `banners?cta_href=eq.${encodeURIComponent(`/products?category=${c.slug}`)}&select=id`,
    { method: "PATCH", body: JSON.stringify({ cta_href: "/products" }) },
  );
  banners += rows.length;
}
console.log(`banner links    : ${banners} repointed`);

// 4. Now nothing references them.
for (const c of stale) {
  await rest(`categories?id=eq.${c.id}`, { method: "DELETE" });
}
console.log(`removed         : ${stale.length}`);

const orphans = await rest("products?category_id=is.null&select=slug");
console.log(`orphaned now    : ${orphans.length}${orphans.length ? " — " + orphans.map((o) => o.slug).join(", ") : ""}`);

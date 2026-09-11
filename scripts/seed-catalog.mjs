#!/usr/bin/env node
/**
 * Apply the catalog seed (scripts/catalog-data.mjs) to the linked Supabase
 * project through PostgREST, using the service-role key.
 *
 *   node scripts/seed-catalog.mjs            # upsert categories, brands, products
 *   node scripts/seed-catalog.mjs --banners  # also refresh hero/offer banners
 *   node scripts/seed-catalog.mjs --flash    # also create a live flash sale
 *
 * Why a script and not a SQL migration: schema and store CONFIGURATION are
 * migrations (0001–0013). Catalog rows are CONTENT — an operator is expected to
 * replace them from /admin — and running them through PostgREST means this
 * works with the service-role key alone, without a management PAT.
 *
 * Idempotent: every write is an upsert keyed on a natural unique column
 * (categories.slug, brands.slug, products.slug, product_variants.sku), so
 * re-running updates rather than duplicating.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, BRANDS, PRODUCTS, IMG, LOCAL } from "./catalog-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
    if (!(key in process.env)) process.env[key] = value;
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const flags = process.argv.slice(2);
const withBanners = flags.includes("--banners");
const withFlash = flags.includes("--flash");

async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Upsert on a natural key and return every affected row. */
const upsert = (table, rows, onConflict) =>
  rest(`${table}?on_conflict=${onConflict}`, {
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
  });

async function main() {
  console.log(`Seeding catalog into ${new global.URL(URL).hostname}\n`);

  // ── Categories ────────────────────────────────────────────────────────────
  const categories = await upsert(
    "categories",
    CATEGORIES.map((c) => ({ ...c, is_active: true })),
    "slug",
  );
  const categoryBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.id]));
  console.log(`categories  ${categories.length}`);

  // ── Brands ────────────────────────────────────────────────────────────────
  const brands = await upsert(
    "brands",
    BRANDS.map((b) => ({ ...b, is_active: true })),
    "slug",
  );
  const brandBySlug = Object.fromEntries(brands.map((b) => [b.slug, b.id]));
  console.log(`brands      ${brands.length}`);

  // ── Products ──────────────────────────────────────────────────────────────
  // `status: 'active'` fires the publish trigger, which stamps published_at
  // once so "newest first" stays stable across later edits.
  // A product carries EITHER stock-photo ids (`images`) or our own uploaded
  // filenames (`localImages`), never both. One resolver so the thumbnail and
  // the gallery cannot disagree about a URL.
  const gallery = (p, width) =>
    p.localImages
      ? p.localImages.map((n) => LOCAL(n))
      : (p.images ?? []).map((id) => IMG(id, width));

  const productRows = PRODUCTS.map((p) => ({
    slug: p.slug,
    name: p.name,
    sku: p.sku,
    category_id: categoryBySlug[p.category] ?? null,
    brand_id: brandBySlug[p.brand] ?? null,
    price_paisa: p.price_paisa,
    compare_at_paisa: p.compare_at_paisa ?? null,
    cost_paisa: p.cost_paisa ?? null,
    // Products with variants get their stock from the sync trigger; seed the
    // parent with the sum so the row is sane even before variants land.
    stock: p.variants
      ? p.variants.reduce((n, v) => n + v.stock, 0)
      : (p.stock ?? 0),
    low_stock_threshold: 5,
    short_description: p.short_description ?? null,
    description: p.description ?? null,
    specifications: p.specifications ?? [],
    features: p.features ?? [],
    warranty: p.warranty ?? null,
    delivery_note: p.delivery_note ?? null,
    status: "active",
    is_featured: p.is_featured ?? false,
    is_new_arrival: p.is_new_arrival ?? false,
    is_best_seller: p.is_best_seller ?? false,
    thumbnail_url: gallery(p, 900)[0] ?? null,
    units_sold: p.is_best_seller ? 40 + Math.floor(p.price_paisa % 90) : 0,
  }));

  const products = await upsert("products", productRows, "slug");
  const productBySlug = Object.fromEntries(products.map((p) => [p.slug, p.id]));
  console.log(`products    ${products.length}`);

  // ── Images ────────────────────────────────────────────────────────────────
  // No natural unique key on product_images, so replace per product rather than
  // upserting — keeps a re-run from stacking duplicates.
  let imageCount = 0;
  for (const p of PRODUCTS) {
    const productId = productBySlug[p.slug];
    const urls = gallery(p, 1200);
    if (!productId || urls.length === 0) continue;

    await rest(`product_images?product_id=eq.${productId}`, { method: "DELETE" });
    await rest("product_images", {
      method: "POST",
      body: urls.map((url, i) => ({
        product_id: productId,
        url,
        alt: `${p.name} — view ${i + 1}`,
        position: i,
      })),
      prefer: "return=minimal",
    });
    imageCount += urls.length;
  }
  console.log(`images      ${imageCount}`);

  // ── Variants ──────────────────────────────────────────────────────────────
  // product_variants is unique on upper(sku) — an EXPRESSION index, which
  // PostgREST's on_conflict cannot target. Replace per product instead.
  let variantCount = 0;
  for (const p of PRODUCTS) {
    const productId = productBySlug[p.slug];
    if (!productId || !p.variants?.length) continue;

    await rest(`product_variants?product_id=eq.${productId}`, { method: "DELETE" });
    await rest("product_variants", {
      method: "POST",
      body: p.variants.map((v, i) => ({
        product_id: productId,
        name: v.name,
        sku: v.sku,
        price_paisa: v.price_paisa ?? null,
        stock: v.stock,
        attributes: v.attributes ?? {},
        position: i,
        is_active: true,
      })),
      prefer: "return=minimal",
    });
    variantCount += p.variants.length;
  }
  console.log(`variants    ${variantCount}`);

  // ── Banners (opt-in) ──────────────────────────────────────────────────────
  // The 0013 banners advertise phones and laptops; this store sells gadgets and
  // accessories, so --banners replaces them with matching copy.
  if (withBanners) {
    // 3:4 crop for the tall campaign tiles.
    const portrait = (id) =>
      `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&h=800&q=80`;

    const banners = [
      {
        id: "b1000000-0000-4000-8000-000000000001",
        placement: "hero",
        eyebrow: "Audio",
        title: "Earbuds that survive the commute",
        subtitle:
          "Hybrid ANC from ৳1,390. Every pair carries a real warranty you can claim in Dhaka.",
        image_url: IMG("1505740420928-5e560c06d30e", 1600),
        mobile_image_url: IMG("1505740420928-5e560c06d30e", 800),
        cta_label: "Shop earbuds",
        cta_href: "/products?category=earbuds-headphones",
        secondary_cta_label: "Compare ANC",
        secondary_cta_href: "/products?category=earbuds-headphones&sort=price_desc",
        accent_hex: "#1B4DFF",
        priority: 100,
        is_active: true,
      },
      {
        id: "b1000000-0000-4000-8000-000000000002",
        placement: "hero",
        eyebrow: "Load shedding",
        title: "Your router does not have to go dark",
        subtitle:
          "Mini UPS units that keep the router and ONU running 6–8 hours. Switchover in under 10ms.",
        image_url: LOCAL("a70"),
        mobile_image_url: LOCAL("a70"),
        cta_label: "Shop mini UPS",
        cta_href: "/products?category=mini-ups",
        accent_hex: "#0F766E",
        priority: 90,
        is_active: true,
      },
      {
        id: "b1000000-0000-4000-8000-000000000003",
        placement: "hero",
        eyebrow: "Big screen",
        title: "A 100-inch picture for less than a TV",
        subtitle:
          "Native 1080p projectors with auto keystone. Set up in under a minute.",
        image_url: IMG("1478720568477-152d9b164e26", 1600),
        mobile_image_url: IMG("1478720568477-152d9b164e26", 800),
        cta_label: "Shop projectors",
        cta_href: "/products?category=projector",
        accent_hex: "#B45309",
        priority: 80,
        is_active: true,
      },

      // ── Campaign tiles ───────────────────────────────────────────────────
      // Tall portrait cards with a Bangla headline burned over the artwork.
      // Every one of these is admin-editable at /admin/banners.
      //
      // The photographs are the ones already verified as matching their
      // subject, re-cropped to 3:4 — `h` alongside `w` makes Unsplash crop to
      // portrait instead of letterboxing a landscape frame.
      {
        id: "c1000000-0000-4000-8000-000000000001",
        placement: "category_tile",
        eyebrow: "১০০% অথেন্টিক প্রোডাক্ট",
        title: "Gaming Zone",
        subtitle: "Keyboards, mice and headsets",
        image_url: portrait("1587829741301-dc798b83add3"),
        cta_label: "Discover",
        cta_href: "/products?category=gaming-accessories",
        accent_hex: "#1B4DFF",
        priority: 50,
        is_active: true,
      },
      {
        id: "c1000000-0000-4000-8000-000000000002",
        placement: "category_tile",
        eyebrow: "বাংলাদেশের সেরা অফার",
        title: "Audio Paradise",
        subtitle: "Earbuds and ANC headphones",
        image_url: portrait("1583394838336-acd977736f90"),
        cta_label: "Listen",
        cta_href: "/products?category=earbuds-headphones",
        accent_hex: "#6D28D9",
        priority: 45,
        is_active: true,
      },
      {
        id: "c1000000-0000-4000-8000-000000000003",
        placement: "category_tile",
        eyebrow: "লোডশেডিংয়ে চিন্তা নেই",
        title: "Always Online",
        subtitle: "Mini UPS for router and ONU",
        image_url: LOCAL("a70"),
        cta_label: "Explore",
        cta_href: "/products?category=mini-ups",
        accent_hex: "#0F766E",
        priority: 40,
        is_active: true,
      },
      {
        id: "c1000000-0000-4000-8000-000000000004",
        placement: "category_tile",
        eyebrow: "ঘরেই ১০০ ইঞ্চি পর্দা",
        title: "Big Screen",
        subtitle: "Native 1080p projectors",
        image_url: portrait("1478720568477-152d9b164e26"),
        cta_label: "View",
        cta_href: "/products?category=projector",
        accent_hex: "#B45309",
        priority: 35,
        is_active: true,
      },
      {
        id: "c1000000-0000-4000-8000-000000000005",
        placement: "category_tile",
        eyebrow: "চার্জ নিয়ে আর ভাবনা নয়",
        title: "Power Up",
        subtitle: "Power banks and GaN chargers",
        image_url: portrait("1583863788434-e58a36330cf0"),
        cta_label: "Shop",
        cta_href: "/products?category=power-bank",
        accent_hex: "#BE123C",
        priority: 30,
        is_active: true,
      },
    ];

    // PostgREST rejects a bulk insert whose rows have different key sets, so
    // normalise every banner to the same shape before sending.
    const keys = [...new Set(banners.flatMap((b) => Object.keys(b)))];
    const normalised = banners.map((b) =>
      Object.fromEntries(keys.map((k) => [k, b[k] ?? null])),
    );

    await upsert("banners", normalised, "id");
    console.log(`banners     ${normalised.length}`);
  }

  // ── Flash sale (opt-in) ───────────────────────────────────────────────────
  if (withFlash) {
    const now = new Date();
    const ends = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const [sale] = await upsert(
      "flash_sales",
      [
        {
          id: "f1000000-0000-4000-8000-000000000001",
          title: "Weekend flash sale",
          subtitle: "Three days only, while stock lasts.",
          starts_at: new Date(now.getTime() - 60_000).toISOString(),
          ends_at: ends.toISOString(),
          is_active: true,
        },
      ],
      "id",
    );

    // A sale price only counts if it undercuts the live price — effective_price()
    // ignores it otherwise, so discount from the real figure.
    const picks = [
      "havit-tw945-earbuds",
      "baseus-bipow-10000",
      "rgb-led-strip-5m",
      "logitech-g102-mouse",
      "tempered-glass-9h",
      "ugreen-usb-c-cable-100w",
    ];

    const items = picks
      .map((slug, i) => {
        const product = PRODUCTS.find((p) => p.slug === slug);
        const id = productBySlug[slug];
        if (!product || !id) return null;
        return {
          flash_sale_id: sale.id,
          product_id: id,
          // Round to whole taka: a ৳1,084.20 sale price reads as a bug.
          sale_price_paisa: Math.round((product.price_paisa * 0.78) / 100) * 100,
          stock_limit: 25,
          sold_count: 4 + i * 3,
          position: i,
        };
      })
      .filter(Boolean);

    await upsert("flash_sale_items", items, "flash_sale_id,product_id");
    console.log(`flash sale  ${items.length} items, ends ${ends.toDateString()}`);
  }

  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  process.exit(1);
});

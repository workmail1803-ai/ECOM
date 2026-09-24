#!/usr/bin/env node
/**
 * Collapse delivery to the options the client asked for.
 *
 *   node scripts/set-delivery-options.mjs --dry
 *   node scripts/set-delivery-options.mjs
 *
 * The old model priced 64 districts across four zones, which meant the
 * shopper had to find their district in a dropdown before they could see a
 * delivery charge. The options below need no lookup at all:
 *
 *   Inside Dhaka    tk 50     1-3 business days
 *   Outside Dhaka   tk 100    2-5 business days   (the fallback)
 *
 * Office Pickup was offered too, and the client has since withdrawn it. Its
 * row is kept but switched OFF rather than deleted: two past orders point at
 * it, and an admin can switch it back on from Settings if pickup returns —
 * the checkout still knows how to present a pickup when the zone is active.
 *
 * `resolve_delivery_zone` already does exact-district-match first and falls
 * back otherwise, so making "Outside Dhaka" the fallback means anything that
 * is not literally Dhaka or a pickup prices correctly with no district list to
 * maintain.
 *
 * Existing orders are untouched: they store the fee they were charged, not a
 * reference to the zone.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
    process.env[line.slice(0, eq).trim()] ??= line.slice(eq + 1).trim();
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
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
};

/**
 * `free_above_paisa` is null on purpose. A free-delivery threshold on top of a
 * flat tk 50 would put a second, invisible rule behind a number the product
 * page states as fact — the whole point of this change is that the charge is
 * knowable before checkout.
 */
const ZONES = [
  {
    slug: "office-pickup",
    name: "Office Pickup",
    fee_paisa: 0,
    free_above_paisa: null,
    // The table enforces `min_days > 0`, so a same-day collection is stored as
    // 1/1 and the UI says "Same day" rather than rendering "1 day".
    min_days: 1,
    max_days: 1,
    districts: ["Office Pickup"],
    is_fallback: false,
    // Withdrawn by the client. Off, not deleted — see the note at the top.
    is_active: false,
    position: 1,
  },
  {
    slug: "inside-dhaka",
    name: "Inside Dhaka",
    fee_paisa: 5000,
    free_above_paisa: null,
    min_days: 1,
    max_days: 3,
    districts: ["Dhaka"],
    is_fallback: false,
    is_active: true,
    position: 2,
  },
  {
    slug: "outside-dhaka",
    name: "Outside Dhaka",
    fee_paisa: 10000,
    free_above_paisa: null,
    min_days: 2,
    max_days: 5,
    // Everything that is not Dhaka or a pickup lands here, so no district
    // list needs maintaining.
    districts: [],
    is_fallback: true,
    is_active: true,
    position: 3,
  },
];

const before = await rest("delivery_zones?select=id,slug,name,fee_paisa&order=position");
console.log("current zones:");
for (const z of before) console.log(`  ${z.slug.padEnd(20)} ৳${z.fee_paisa / 100}`);
console.log("\ntarget zones:");
for (const z of ZONES) console.log(`  ${z.slug.padEnd(20)} ৳${z.fee_paisa / 100}`);

if (DRY) {
  console.log("\n--dry: nothing written.");
  process.exit(0);
}

// A partial unique index (`delivery_zones_one_fallback`) allows exactly one
// fallback zone, so the flag has to be cleared before the new fallback is
// written — otherwise the upsert collides with whichever zone currently holds
// it. Stand the flag down first, then claim it.
await rest("delivery_zones?is_fallback=eq.true", {
  method: "PATCH",
  body: JSON.stringify({ is_fallback: false }),
});

const saved = await rest("delivery_zones?on_conflict=slug", {
  method: "POST",
  body: JSON.stringify(ZONES),
  headers: { Prefer: "resolution=merge-duplicates,return=representation" },
});
console.log(`\nupserted: ${saved.length}`);

const keep = new Set(ZONES.map((z) => z.slug));
const stale = before.filter((z) => !keep.has(z.slug));
for (const z of stale) await rest(`delivery_zones?id=eq.${z.id}`, { method: "DELETE" });
console.log(`removed : ${stale.length}${stale.length ? " — " + stale.map((z) => z.slug).join(", ") : ""}`);

const after = await rest("delivery_zones?select=slug,fee_paisa,is_fallback&order=position");
console.log("\nfinal:");
for (const z of after) {
  console.log(`  ${z.slug.padEnd(20)} ৳${z.fee_paisa / 100}${z.is_fallback ? "  (fallback)" : ""}`);
}

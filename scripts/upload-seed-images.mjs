#!/usr/bin/env node
/**
 * Upload the local seed photographs in .seedimg/ to the `product-images`
 * bucket, and print the public URL for each.
 *
 *   node scripts/upload-seed-images.mjs
 *
 * Only the files listed in NEEDED are uploaded — the rest of the catalog uses
 * higher-resolution stock imagery. These are placeholders: replace them with
 * real product photography from /admin before launch.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const NEEDED = [
  "a03", "a13", "a16", "a46", "a47", "a48", "a49", "a65", "a66",
  "a68", "a70", "a71", "a72", "a74", "a77", "a79", "a81", "a88",
];

const results = {};

for (const name of NEEDED) {
  const path = join(root, ".seedimg", `${name}.jpg`);
  if (!existsSync(path)) {
    console.warn(`skip ${name} — not found`);
    continue;
  }

  const body = readFileSync(path);
  const objectPath = `seed/${name}.jpg`;

  const res = await fetch(`${URL_BASE}/storage/v1/object/product-images/${objectPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      apikey: KEY,
      "Content-Type": "image/jpeg",
      // Overwrite on re-run rather than erroring with "already exists".
      "x-upsert": "true",
    },
    body,
  });

  if (!res.ok) {
    console.error(`FAILED ${name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    continue;
  }

  results[name] = `${URL_BASE}/storage/v1/object/public/product-images/${objectPath}`;
  console.log(`uploaded ${name}`);
}

console.log(`\n${Object.keys(results).length} of ${NEEDED.length} uploaded.`);
console.log(JSON.stringify(results, null, 2));

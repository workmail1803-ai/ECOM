#!/usr/bin/env node
/**
 * Apply supabase/migrations/*.sql to the linked project via the Supabase
 * Management API.
 *
 *   node scripts/db-apply.mjs                 # apply every migration in order
 *   node scripts/db-apply.mjs 0004 0005       # apply only files matching a prefix
 *   node scripts/db-apply.mjs --list          # show what would run
 *
 * Requires SUPABASE_ACCESS_TOKEN (a personal access token, sbp_...) and either
 * SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL in the environment or in
 * .env.local. Migrations are written to be idempotent, so re-running is safe.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(file) {
  const path = join(root, file);
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
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

loadEnvFile(".env.local");
loadEnvFile(".env");

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]
    : null);

if (!token) {
  console.error(
    "SUPABASE_ACCESS_TOKEN is not set.\n" +
      "Create one at https://supabase.com/dashboard/account/tokens then:\n" +
      "  export SUPABASE_ACCESS_TOKEN=sbp_...",
  );
  process.exit(1);
}
if (!ref) {
  console.error("Cannot determine project ref. Set SUPABASE_PROJECT_REF.");
  process.exit(1);
}

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const filters = args.filter((a) => !a.startsWith("--"));

const migrationsDir = join(root, "supabase", "migrations");
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => filters.length === 0 || filters.some((p) => f.startsWith(p)));

if (files.length === 0) {
  console.error("No migrations matched.");
  process.exit(1);
}

console.log(`project ${ref} — ${files.length} migration(s)`);
if (listOnly) {
  for (const f of files) console.log("  " + f);
  process.exit(0);
}

const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function runSql(query) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 4000)}`);
  }
  return text;
}

let failed = false;
for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  process.stdout.write(`→ ${file} ... `);
  const startedAt = process.hrtime.bigint();
  try {
    await runSql(sql);
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(`ok (${ms.toFixed(0)}ms)`);
  } catch (err) {
    console.log("FAILED");
    console.error(String(err.message || err));
    failed = true;
    break;
  }
}

if (failed) {
  console.error("\nMigration run aborted. Fix the SQL and re-run — migrations are idempotent.");
  process.exit(1);
}

console.log("\nAll migrations applied.");

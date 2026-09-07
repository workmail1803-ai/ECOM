#!/usr/bin/env node
/**
 * Promote an existing account to admin (or manager).
 *
 *   node scripts/make-admin.mjs you@example.com
 *   node scripts/make-admin.mjs you@example.com manager
 *
 * The account must already exist — sign up through the UI first. Roles live in
 * `user_roles`, never on `profiles`, so that "edit my name" and "grant myself
 * admin" can never be the same permission. This script uses the service-role
 * key, which is the only credential that may write that table.
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

const email = process.argv[2];
const role = process.argv[3] ?? "admin";

if (!email) {
  console.error("Usage: node scripts/make-admin.mjs <email> [admin|manager]");
  process.exit(1);
}
if (!["admin", "manager", "customer"].includes(role)) {
  console.error(`Unknown role "${role}". Use admin, manager or customer.`);
  process.exit(1);
}
if (!URL_BASE || !KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

const profileRes = await fetch(
  `${URL_BASE}/rest/v1/profiles?select=id,email&email=eq.${encodeURIComponent(email)}`,
  { headers },
);
const profiles = await profileRes.json();

if (!Array.isArray(profiles) || profiles.length === 0) {
  console.error(
    `No account found for ${email}.\nSign up through the UI first, then re-run this.`,
  );
  process.exit(1);
}

const userId = profiles[0].id;

// Replace the role set rather than accumulating rows — my_role() takes the
// highest, so a stale 'admin' row would survive a demotion.
await fetch(`${URL_BASE}/rest/v1/user_roles?user_id=eq.${userId}`, {
  method: "DELETE",
  headers,
});

const insert = await fetch(`${URL_BASE}/rest/v1/user_roles`, {
  method: "POST",
  headers: { ...headers, Prefer: "return=representation" },
  body: JSON.stringify({ user_id: userId, role }),
});

if (!insert.ok) {
  console.error(`Failed: ${insert.status} ${(await insert.text()).slice(0, 300)}`);
  process.exit(1);
}

console.log(`${email} is now ${role}. Sign out and back in to pick up the change.`);

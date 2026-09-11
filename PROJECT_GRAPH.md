# Nazmul Commerce — project graph

The authoritative map of this codebase. Read this before changing anything;
`CLAUDE.md` is the short version of the rules below.

Bangladesh electronics & gadgets storefront + back office.
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase
(Postgres 17 + Auth + Storage + RLS).

---

## 1. The one rule everything else serves

**Money is computed in Postgres. React displays it; React never decides it.**

```
browser  ──sends──▶  cart id · district · coupon code
                          │
                          ▼
                   quote_cart()          ← 0008_pricing.sql
                          │  reads live products / variants / flash_sale_items
                          │  applies coupon rules, resolves delivery zone
                          ▼
                   authoritative JSON breakdown
                          │
browser  ◀──renders──┘

checkout ──sends──▶  cart id · name · phone · address · payment method
                          │        (NO price, NO total, NO discount)
                          ▼
                    place_order()        ← 0010_orders_rpc.sql
                          │  re-runs quote_cart(), locks stock rows,
                          │  writes order + items + payment + history
                          ▼
                    order row, with a CHECK enforcing
                    total = subtotal - discount + delivery
```

`orders` has **no INSERT policy**. A client cannot create an order at all, with
a forged total or otherwise — only the `SECURITY DEFINER` `place_order()` can.

Verified end-to-end: a guest cart with `BIDYUT10` applied produced
৳5,190 − ৳519 + ৳60 = **৳4,731** on order `BD-100001`, every figure computed in
SQL.

---

## 2. Layout

```
app/
  (storefront)/          public shop — shares Header/Footer/SupportWidget
    page.tsx             homepage: hero, categories, flash sale, rails, reviews
    products/            listing (filters, sort, pagination) + [slug] PDP
    cart/ checkout/      cart, checkout, checkout/failed
    order/confirmed/     post-checkout receipt
    order/pay/           manual bKash/Nagad proof submission
    track/               guest tracking (order number + phone)
    account/             orders, wishlist, addresses, profile, password
    contact/             support channels
    [slug]/              policy pages, from lib/content/pages.ts
  (auth)/                sign-in, sign-up, forgot-password, reset-password
  admin/                 back office (see §5)
  api/payments/[provider]/callback   gateway returns
  auth/callback          email confirmation + guest-cart merge
  sitemap.ts robots.ts not-found.tsx error.tsx

components/{ui,storefront,product,cart,checkout,account,admin}
lib/{supabase,payments,pricing,queries,actions,auth,cart,validations,content,utils}
supabase/migrations/     schema, RLS, functions, seed  (0001 → 0015)
scripts/                 db-apply, seed-catalog, upload-seed-images, make-admin
types/database.ts        hand-maintained mirror of the schema
tests/                   vitest — money, validations
```

Business logic lives in `lib/`, never in a page component.

---

## 3. Data flow by surface

| Surface | Reads through | Writes through |
|---|---|---|
| Storefront pages | `lib/queries/*` (user-scoped client, RLS applies) | — |
| Cart | `quote_cart()` via `lib/actions/cart.ts` | `cart_*` RPCs (SECURITY DEFINER, check the guest cookie) |
| Checkout | `quote_cart()` | `place_order()` |
| Account | user-scoped client, RLS scopes to `auth.uid()` | `lib/actions/account.ts` |
| Admin | **service-role** client via `lib/queries/admin.ts` | `lib/actions/admin.ts` |
| Payment callbacks | service role | `settle_payment()` |

### The three Supabase clients

- `lib/supabase/server.ts` — request-scoped, carries the user's session. **Default.**
- `lib/supabase/client.ts` — browser, anon key. Auth transitions only.
- `lib/supabase/admin.ts` — service role, **bypasses RLS**. Legitimate only for:
  admin reads of `products.cost_paisa`, payment webhooks, and scripts. Every
  call site must call `requireStaff()` first. It is `server-only`.

---

## 4. Invariants — break these and something silently rots

1. **Integer paisa everywhere.** 1 BDT = 100 paisa. Division by 100 happens
   exactly once, in `lib/utils/money.ts`. Never float, never string.
2. **`select *` on `products` FAILS** for anon and authenticated. Migration 0011
   revokes the table grant and re-issues it as an explicit column list omitting
   `cost_paisa`. Name your columns — see `PRODUCT_CARD_COLUMNS`.
3. **`auth.uid()` inside a policy must be `(select auth.uid())`.** Postgres then
   hoists it to an InitPlan and evaluates it once per statement instead of once
   per row. On a 5,000-row scan that is 4 ms versus 900 ms.
4. **RLS is the security boundary, not the router.** `middleware.ts` redirects
   are UX. Authorization is `is_staff()` / `is_admin()` (SECURITY DEFINER, read
   `user_roles`) — never a client-supplied claim.
5. **Roles live in `user_roles`, not on `profiles`.** If the role sat on a row
   the user may update, a customer could grant themselves admin.
6. **No payment-provider branch outside `lib/payments/`.** Checkout talks to the
   `PaymentProvider` interface only.
7. **No placeholder UI.** A provider without credentials is *hidden*, not shown
   broken — two gates: `PAYMENTS_ENABLED_PROVIDERS` (business) and
   `isConfigured()` (technical).
8. **Order status changes go through `update_order_status()`**, never a direct
   UPDATE. That function owns the legal-transition table and puts stock back on
   cancel/return, in one transaction.
9. **Guest carts are unreachable from the client.** No anon policy on
   `carts`/`cart_items`; the cart UUID never leaves the server. Anonymous access
   is only via the SECURITY DEFINER RPCs, which check the httpOnly cookie token.
10. **Coupons have no public read policy.** Letting anon SELECT `coupons` would
    let anyone enumerate every discount code. Validation is inside `quote_cart()`.
11. **A manual payment is settled by a person, never by a request.** Only
    `verify_manual_payment()` can mark a manual transfer successful, it requires
    the `payments` permission, and it records `verified_by`. The customer
    submitting a transaction id changes nothing but `pending`.
12. **`payment-proofs` is the one private bucket.** A payment screenshot shows a
    wallet balance and a phone number. There is no client write policy at all —
    uploads go through a server action using the service role, after the
    order-number + phone pair has been checked. Staff read via 5-minute signed
    URLs.
13. **Permissions are checked in SQL, not just in the nav.** `has_permission()`
    is SECURITY DEFINER over `staff_permissions`. Hiding a nav link is a
    courtesy; `requirePermission()` on the page and the SQL check in the
    function are the lock.

---

## 5. Admin

`/admin` — staff (`admin` or `manager`). `/admin/settings` — `admin` only.

Dashboard · Products (CRUD, margin) · Categories · Stock (inline edit) ·
Orders (status transitions) · Payments · Customers (role assignment) ·
Coupons · Banners · Reviews (moderation) · Reports (revenue, COGS, margin,
product performance, payment mix) · Staff (roles + per-section grants, admin
only) · Settings (store config + delivery zones, admin only).

Margin and cost of goods are admin-only *because* `cost_paisa` is revoked at
the column level — the storefront literally cannot read it.

---

## 5a. Manual bKash / Nagad verification

Bangladeshi merchants overwhelmingly take wallet payments by hand: the customer
sends money from their own app and quotes the transaction id. That flow is
first-class here.

```
checkout (bkash) ──▶ place_order()          payment row, status 'initiated'
                          │                 is_manual = true
                          ▼
                   /order/pay?ref=BD-100123
                          │  customer enters TRX id, sender number, screenshot
                          ▼
               submit_payment_proof()        status 'pending'
                   order_number + phone      (the same second factor as /track)
                          │
                          ▼
               /admin/payments  ──▶ staff look at the screenshot and the id
                          │
              verify_manual_payment()        approve → 'successful' + order
                requires `payments` perm     confirmed, verified_by recorded
                                             reject  → 'failed', order stays
                                                       open so they can resubmit
```

`lib/payments/index.ts` picks the implementation: bKash and Nagad resolve to the
**gateway** provider when its credentials are in env, and to the **manual**
provider otherwise. The customer sees one "bKash" option either way, and no
`if (manual)` branch leaks into checkout.

To turn it on: apply 0015, then add `bkash` / `nagad` to
`PAYMENTS_ENABLED_PROVIDERS`, then set the receive numbers at /admin/settings.

## 5b. Staff and permissions

`admin` is unrestricted and cannot be narrowed — someone has to be able to fix a
lockout. `manager` holds only the sections granted in `staff_permissions`.
`settings` and `staff` are never grantable, because whoever can grant access can
grant themselves anything.

Managed at **/admin/staff**: find an existing account by email, pick a role, tick
sections. `set_staff_access()` writes the role and the grants in one transaction
and refuses to let an admin change their own access.

Enforcement is three-deep: the nav hides what you cannot use,
`requirePermission()` guards the page and every action, and `has_permission()`
re-checks inside SQL.

## 6. Database RAM discipline (free tier ≈ 1 GB)

Every index must be held in `shared_buffers` to be worth anything.

- **One GIN index** — `products.search_vector`. Do **not** add per-column
  trigram indexes; three on a 5k-product table cost more resident memory than
  the entire heap.
- Product indexes are **partial**, scoped to `status = 'active'`, and each maps
  to a query the app actually runs (category listing, newest, price sort, best
  sellers, featured, brand, low stock, search). Adding a filter that cannot use
  one of them means a sequential scan.
- `recently_viewed` is capped at 20 rows per user by trigger; **guest** history
  lives in `localStorage`. A DB write per anonymous page view is the fastest way
  to exhaust the tier.
- Rating and units-sold are **maintained rollups** on `products`, so a product
  card never joins `reviews` or `order_items`.
- Homepage is `revalidate = 300`; cart/checkout/account/admin are
  `force-dynamic`.
- Sitemap is capped at 1,000 products.

---

## 7. Migrations

Plain SQL in `supabase/migrations/`, applied in filename order, **idempotent**.

| File | Contents |
|---|---|
| 0001 | extensions, enums, `slugify`, `updated_at` trigger |
| 0002 | profiles, user_roles, addresses, auth→profile bridge |
| 0003 | categories, brands, products, variants, images, attributes, search vector |
| 0004 | carts, cart_items, wishlist, recently_viewed, newsletter |
| 0005 | delivery_zones, coupons, flash sales, banners, referrals, settings |
| 0006 | orders, order_items, status history, payments, reviews, audit log |
| 0007 | `has_role` / `is_staff` / `is_admin` / `my_role` / `log_audit` |
| 0008 | **pricing** — `effective_price`, `resolve_delivery_zone`, `quote_cart` |
| 0009 | cart RPCs, wishlist, guest-cart merge |
| 0010 | **`place_order`**, status transitions, tracking, `settle_payment` |
| 0011 | **RLS** for every table, plus the `cost_paisa` column revoke |
| 0012 | storage buckets and object policies |
| 0013 | seed: settings, delivery zones, coupons, banners |
| 0014 | **fix**: `+880…` phone normalisation (see below) |
| 0015 | manual bKash/Nagad verification + granular staff permissions |

Apply with `node scripts/db-apply.mjs` (needs `SUPABASE_ACCESS_TOKEN`, an
`sbp_…` management PAT) or paste into the SQL editor.

> **0014 is written but NOT yet applied** — the management PAT available during
> development was invalid. The bug it fixes: 0002/0010 stripped the `880`
> country code with an `if/elsif` chain that could never also restore the local
> leading zero, so `+8801712345678` normalised to `1712345678` and failed the
> `^01[3-9][0-9]{8}$` CHECK. `lib/validations/checkout.ts` normalises correctly
> before the value ever reaches Postgres, so checkout is unaffected today — but
> apply 0014 to fix direct writes (profile edits, address saves).

### Catalog seed is a script, not a migration

Schema and store *configuration* are migrations. Catalog *content* is
`scripts/catalog-data.mjs` + `scripts/seed-catalog.mjs`, applied over PostgREST
with the service-role key — it needs no management PAT, and an operator is
expected to replace it from `/admin`.

```bash
node scripts/seed-catalog.mjs --banners --flash
node scripts/upload-seed-images.mjs     # placeholder photography → Storage
```

Two PostgREST gotchas the seeder works around: `on_conflict` cannot target an
**expression** unique index (`product_variants` is unique on `upper(sku)`), and
a bulk insert requires **identical key sets** across rows.

---

## 8. Current state

**Live and verified**: catalog (9 categories, 18 brands, 25 products, 14
variants), homepage, listing + filters, PDP, cart, coupons, checkout, COD
orders, guest tracking, accounts, full admin, reports.

**Payments**: COD is live. bKash and Nagad each have two implementations — the
automated gateway (Tokenized Checkout / RSA-signed) and manual staff
verification — and resolve to whichever is configured. Card (SSLCOMMERZ) is
gateway-only. All stay **hidden** until listed in `PAYMENTS_ENABLED_PROVIDERS`.

**Homepage campaign tiles**: tall portrait cards with a Bangla headline over the
artwork, driven by `banners` rows with `placement = 'category_tile'` and fully
admin-editable. Bengali is set in Noto Sans Bengali, loaded as a second family
after Inter so mixed-script copy renders each script properly.

**Known gaps**
- Migrations 0014 and 0015 not applied (see above). Until 0015 lands, the manual
  payment flow and the staff permission editor are inert: `my_permissions()`
  falls back to the pre-0015 behaviour where every staff member had every
  section, so the admin panel keeps working unchanged.
- Product images are placeholders. Real photography replaces them from `/admin`.
- Email is disabled — `RESEND_API_KEY` is empty, so the app logs instead of
  sending. Order confirmation emails need that key.
- Abandoned-cart reminders, referrals and bundle offers have schema support but
  no UI yet.

## 9. Commands

```bash
npm run dev        # next dev
npm run typecheck  # tsc --noEmit   ← before claiming done
npm run test       # vitest
npm run build      # production build
npm run verify     # all three
```

Admin bootstrap: sign up through the UI, then
`node scripts/make-admin.mjs you@example.com`.

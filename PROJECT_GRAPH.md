# Bidyut Commerce — project graph

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
supabase/migrations/     schema, RLS, functions, seed  (0001 → 0014)
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

---

## 5. Admin

`/admin` — staff (`admin` or `manager`). `/admin/settings` — `admin` only.

Dashboard · Products (CRUD, margin) · Categories · Stock (inline edit) ·
Orders (status transitions) · Payments · Customers (role assignment) ·
Coupons · Banners · Reviews (moderation) · Reports (revenue, COGS, margin,
product performance, payment mix) · Settings (store config + delivery zones).

Margin and cost of goods are admin-only *because* `cost_paisa` is revoked at
the column level — the storefront literally cannot read it.

---

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

**Payments**: COD is live. bKash (Tokenized Checkout), Nagad (RSA-signed) and
card (SSLCOMMERZ) are fully implemented and **hidden** until credentials are
added to `.env` and the id is listed in `PAYMENTS_ENABLED_PROVIDERS`.

**Known gaps**
- Migration 0014 not applied (see above).
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

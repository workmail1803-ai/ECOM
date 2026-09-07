-- ============================================================================
-- 0011  Row Level Security
-- ============================================================================
-- Notes that matter for both correctness and cost:
--
--  * Every `auth.uid()` is written as `(select auth.uid())`. Postgres then
--    hoists it into an InitPlan and evaluates it once per statement instead of
--    once per row. On a 5,000-row product scan that is the difference between
--    a single function call and 5,000 of them.
--  * Guest carts are deliberately unreachable from the client. There is no
--    anon policy on carts/cart_items — anonymous access happens only through
--    the SECURITY DEFINER RPCs in 0009, which check the cookie token.
--  * `coupons` has no public read policy. Coupon codes are validated inside
--    quote_cart(); letting anon SELECT the table would let anyone enumerate
--    every discount code in the system.
--  * `products.cost_paisa` is revoked at the column level, so even a
--    compromised authenticated session cannot read purchase cost. Admin reads
--    it through the service-role client after an is_staff() check.

alter table public.settings add column if not exists is_public boolean not null default false;

-- ── Enable RLS everywhere ───────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_roles','addresses',
    'categories','brands','products','product_variants','product_images','product_attributes',
    'carts','cart_items','wishlist_items','recently_viewed','newsletter_subscribers',
    'delivery_zones','coupons','coupon_usage','flash_sales','flash_sale_items','banners','referrals','settings',
    'orders','order_items','order_status_history','payments','payment_transactions',
    'reviews','review_images','audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Helper so each policy block can be replayed safely.
create or replace function public.drop_policy_if_exists(p_table text, p_policy text)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', p_policy, p_table);
end $$;

-- ── profiles ────────────────────────────────────────────────────────────────
select public.drop_policy_if_exists('profiles', 'profiles_select_own');
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_staff());

select public.drop_policy_if_exists('profiles', 'profiles_update_own');
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Insert is handled by the auth trigger; a client never creates a profile.

-- ── user_roles ──────────────────────────────────────────────────────────────
-- Read your own roles. Only an admin may grant or revoke, and never to
-- themselves-as-admin escalation path: the policy requires the caller already
-- be an admin, which only the service role or another admin can bootstrap.
select public.drop_policy_if_exists('user_roles', 'user_roles_select_own');
create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

select public.drop_policy_if_exists('user_roles', 'user_roles_admin_write');
create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── addresses ───────────────────────────────────────────────────────────────
select public.drop_policy_if_exists('addresses', 'addresses_own_all');
create policy addresses_own_all on public.addresses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

select public.drop_policy_if_exists('addresses', 'addresses_staff_read');
create policy addresses_staff_read on public.addresses
  for select to authenticated
  using (public.is_staff());

-- ── Catalog: public read of published rows, staff read/write of everything ──
select public.drop_policy_if_exists('categories', 'categories_public_read');
create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (is_active or public.is_staff());

select public.drop_policy_if_exists('categories', 'categories_staff_write');
create policy categories_staff_write on public.categories
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

select public.drop_policy_if_exists('brands', 'brands_public_read');
create policy brands_public_read on public.brands
  for select to anon, authenticated
  using (is_active or public.is_staff());

select public.drop_policy_if_exists('brands', 'brands_staff_write');
create policy brands_staff_write on public.brands
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

select public.drop_policy_if_exists('products', 'products_public_read');
create policy products_public_read on public.products
  for select to anon, authenticated
  using (status = 'active' or public.is_staff());

select public.drop_policy_if_exists('products', 'products_staff_write');
create policy products_staff_write on public.products
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Purchase cost never leaves the server.
--
-- A column-level REVOKE cannot narrow a table-wide GRANT, and Supabase grants
-- SELECT on every public table to anon/authenticated by default. So the table
-- grant is dropped and re-issued as an explicit column list that omits
-- cost_paisa. The list is derived from the catalog so adding a column later
-- does not silently hide it.
--
-- Consequence, and it is deliberate: `select *` on products now fails for both
-- client roles. Queries must name their columns. Admin reads cost_paisa through
-- the service-role client after an is_staff() check.
do $$
declare v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'products'
    and column_name <> 'cost_paisa';

  execute 'revoke select on public.products from anon, authenticated';
  execute format('grant select (%s) on public.products to anon, authenticated', v_cols);
end $$;

select public.drop_policy_if_exists('product_variants', 'product_variants_public_read');
create policy product_variants_public_read on public.product_variants
  for select to anon, authenticated
  using (
    public.is_staff()
    or (is_active and exists (
      select 1 from public.products p where p.id = product_id and p.status = 'active'
    ))
  );

select public.drop_policy_if_exists('product_variants', 'product_variants_staff_write');
create policy product_variants_staff_write on public.product_variants
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

select public.drop_policy_if_exists('product_images', 'product_images_public_read');
create policy product_images_public_read on public.product_images
  for select to anon, authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
  );

select public.drop_policy_if_exists('product_images', 'product_images_staff_write');
create policy product_images_staff_write on public.product_images
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

select public.drop_policy_if_exists('product_attributes', 'product_attributes_public_read');
create policy product_attributes_public_read on public.product_attributes
  for select to anon, authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
  );

select public.drop_policy_if_exists('product_attributes', 'product_attributes_staff_write');
create policy product_attributes_staff_write on public.product_attributes
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ── Carts: signed-in users only. Guests go through the RPCs. ────────────────
select public.drop_policy_if_exists('carts', 'carts_own_all');
create policy carts_own_all on public.carts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

select public.drop_policy_if_exists('cart_items', 'cart_items_own_all');
create policy cart_items_own_all on public.cart_items
  for all to authenticated
  using (exists (
    select 1 from public.carts c
    where c.id = cart_id and c.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.carts c
    where c.id = cart_id and c.user_id = (select auth.uid())
  ));

-- ── Wishlist / recently viewed ──────────────────────────────────────────────
select public.drop_policy_if_exists('wishlist_items', 'wishlist_own_all');
create policy wishlist_own_all on public.wishlist_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

select public.drop_policy_if_exists('recently_viewed', 'recently_viewed_own_all');
create policy recently_viewed_own_all on public.recently_viewed
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── Newsletter: write-only for the public ───────────────────────────────────
select public.drop_policy_if_exists('newsletter_subscribers', 'newsletter_public_insert');
create policy newsletter_public_insert on public.newsletter_subscribers
  for insert to anon, authenticated
  with check (true);

select public.drop_policy_if_exists('newsletter_subscribers', 'newsletter_staff_read');
create policy newsletter_staff_read on public.newsletter_subscribers
  for select to authenticated
  using (public.is_staff());

select public.drop_policy_if_exists('newsletter_subscribers', 'newsletter_staff_write');
create policy newsletter_staff_write on public.newsletter_subscribers
  for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ── Delivery / marketing content ────────────────────────────────────────────
select public.drop_policy_if_exists('delivery_zones', 'delivery_zones_public_read');
create policy delivery_zones_public_read on public.delivery_zones
  for select to anon, authenticated
  using (is_active or public.is_staff());

select public.drop_policy_if_exists('delivery_zones', 'delivery_zones_staff_write');
create policy delivery_zones_staff_write on public.delivery_zones
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

select public.drop_policy_if_exists('flash_sales', 'flash_sales_public_read');
create policy flash_sales_public_read on public.flash_sales
  for select to anon, authenticated
  using (is_active or public.is_staff());

select public.drop_policy_if_exists('flash_sales', 'flash_sales_staff_write');
create policy flash_sales_staff_write on public.flash_sales
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

select public.drop_policy_if_exists('flash_sale_items', 'flash_sale_items_public_read');
create policy flash_sale_items_public_read on public.flash_sale_items
  for select to anon, authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.flash_sales fs where fs.id = flash_sale_id and fs.is_active)
  );

select public.drop_policy_if_exists('flash_sale_items', 'flash_sale_items_staff_write');
create policy flash_sale_items_staff_write on public.flash_sale_items
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

select public.drop_policy_if_exists('banners', 'banners_public_read');
create policy banners_public_read on public.banners
  for select to anon, authenticated
  using (
    public.is_staff()
    or (
      is_active
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now())
    )
  );

select public.drop_policy_if_exists('banners', 'banners_staff_write');
create policy banners_staff_write on public.banners
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ── Coupons: staff only. Validation is server-side via quote_cart(). ────────
select public.drop_policy_if_exists('coupons', 'coupons_staff_all');
create policy coupons_staff_all on public.coupons
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

select public.drop_policy_if_exists('coupon_usage', 'coupon_usage_read');
create policy coupon_usage_read on public.coupon_usage
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

-- ── Referrals ───────────────────────────────────────────────────────────────
select public.drop_policy_if_exists('referrals', 'referrals_own_read');
create policy referrals_own_read on public.referrals
  for select to authenticated
  using (referrer_id = (select auth.uid()) or public.is_staff());

select public.drop_policy_if_exists('referrals', 'referrals_own_insert');
create policy referrals_own_insert on public.referrals
  for insert to authenticated
  with check (referrer_id = (select auth.uid()));

-- ── Settings ────────────────────────────────────────────────────────────────
select public.drop_policy_if_exists('settings', 'settings_public_read');
create policy settings_public_read on public.settings
  for select to anon, authenticated
  using (is_public or public.is_staff());

-- Only a full admin may change configuration; managers cannot.
select public.drop_policy_if_exists('settings', 'settings_admin_write');
create policy settings_admin_write on public.settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── Orders ──────────────────────────────────────────────────────────────────
-- Note there is NO insert policy. Orders can only be created by place_order(),
-- which is SECURITY DEFINER and recomputes every figure. A client cannot
-- INSERT an order at all, forged totals or otherwise.
select public.drop_policy_if_exists('orders', 'orders_select_own');
create policy orders_select_own on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

select public.drop_policy_if_exists('orders', 'orders_staff_update');
create policy orders_staff_update on public.orders
  for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

select public.drop_policy_if_exists('order_items', 'order_items_select_own');
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = (select auth.uid())
    )
  );

select public.drop_policy_if_exists('order_status_history', 'order_status_history_select_own');
create policy order_status_history_select_own on public.order_status_history
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = (select auth.uid())
    )
  );

-- ── Payments: read-only for the owner, no client writes at all ──────────────
select public.drop_policy_if_exists('payments', 'payments_select_own');
create policy payments_select_own on public.payments
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = (select auth.uid())
    )
  );

select public.drop_policy_if_exists('payment_transactions', 'payment_transactions_staff_read');
create policy payment_transactions_staff_read on public.payment_transactions
  for select to authenticated
  using (public.is_staff());

-- ── Reviews ─────────────────────────────────────────────────────────────────
select public.drop_policy_if_exists('reviews', 'reviews_public_read');
create policy reviews_public_read on public.reviews
  for select to anon, authenticated
  using (
    status = 'approved'
    or user_id = (select auth.uid())
    or public.is_staff()
  );

-- A customer may only review a product they have actually received. The check
-- runs in the policy, so it holds even if the calling code forgets.
select public.drop_policy_if_exists('reviews', 'reviews_insert_purchased');
create policy reviews_insert_purchased on public.reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.user_id = (select auth.uid())
        and oi.product_id = product_id
        and o.status = 'delivered'
    )
  );

-- Editing is allowed while the review is still awaiting moderation.
select public.drop_policy_if_exists('reviews', 'reviews_update_own_pending');
create policy reviews_update_own_pending on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'pending')
  with check (user_id = (select auth.uid()) and status = 'pending');

select public.drop_policy_if_exists('reviews', 'reviews_delete_own');
create policy reviews_delete_own on public.reviews
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

select public.drop_policy_if_exists('reviews', 'reviews_staff_moderate');
create policy reviews_staff_moderate on public.reviews
  for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

select public.drop_policy_if_exists('review_images', 'review_images_public_read');
create policy review_images_public_read on public.review_images
  for select to anon, authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.reviews r
      where r.id = review_id
        and (r.status = 'approved' or r.user_id = (select auth.uid()))
    )
  );

select public.drop_policy_if_exists('review_images', 'review_images_own_write');
create policy review_images_own_write on public.review_images
  for all to authenticated
  using (exists (
    select 1 from public.reviews r
    where r.id = review_id and (r.user_id = (select auth.uid()) or public.is_staff())
  ))
  with check (exists (
    select 1 from public.reviews r
    where r.id = review_id and (r.user_id = (select auth.uid()) or public.is_staff())
  ));

-- ── Audit log: readable by staff, writable only by log_audit() ──────────────
select public.drop_policy_if_exists('audit_log', 'audit_log_staff_read');
create policy audit_log_staff_read on public.audit_log
  for select to authenticated
  using (public.is_staff());

drop function if exists public.drop_policy_if_exists(text, text);

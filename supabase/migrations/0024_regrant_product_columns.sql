-- ============================================================================
-- 0024  Re-grant SELECT on products after adding a column
-- ============================================================================
-- Adding `points_per_purchase` in 0023 broke every product page: "Product not
-- found" for anyone not signed in as staff.
--
-- Migration 0011 revokes the table-wide SELECT on `products` and re-issues it
-- as an EXPLICIT column list — every column except cost_paisa — computed from
-- information_schema at the moment it ran. A column added afterwards is simply
-- not in that grant, so a storefront query naming it fails the whole select
-- and the product reads as missing.
--
-- This re-runs the same block so the grant covers today's columns.
--
-- If you add another column to `products` and the storefront needs it, you
-- must re-run this. The alternative — granting the table and hiding cost with
-- a view — was considered and rejected in 0011: column grants are what keep
-- cost_paisa unreadable even through a select *, and that is worth the upkeep.
--
-- Idempotent.

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

-- Prove the thing that broke is fixed, and that the thing it protects is still
-- protected.
do $$
begin
  if not has_column_privilege('anon', 'public.products', 'points_per_purchase', 'SELECT') then
    raise exception 'anon still cannot read points_per_purchase';
  end if;

  if has_column_privilege('anon', 'public.products', 'cost_paisa', 'SELECT') then
    raise exception 'anon can read cost_paisa, which must never be granted';
  end if;
end $$;

-- ============================================================================
-- 0009  Cart / order / wishlist RPCs
-- ============================================================================
-- Guest carts are addressed by a random token held in an httpOnly cookie. RLS
-- cannot see that token (it is not a JWT claim), so guest cart mutations go
-- through these SECURITY DEFINER functions, which check ownership themselves.
-- The cart UUID never reaches the browser — the server action resolves it from
-- the cookie on every request.

-- Keep products.stock as the sum of variant stock for products that have
-- variants. Single-SKU products manage products.stock directly.
create or replace function public.tg_sync_product_stock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_product uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p
     set stock = coalesce((
           select sum(v.stock) from public.product_variants v
           where v.product_id = v_product and v.is_active
         ), 0)
   where p.id = v_product
     and exists (select 1 from public.product_variants v where v.product_id = v_product);
  return null;
end;
$$;

drop trigger if exists sync_product_stock on public.product_variants;
create trigger sync_product_stock
  after insert or update of stock, is_active or delete on public.product_variants
  for each row execute function public.tg_sync_product_stock();

-- ── Ownership guard ─────────────────────────────────────────────────────────
create or replace function public.assert_cart_access(p_cart_id uuid, p_guest_token text)
returns public.carts
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cart public.carts;
  v_user uuid := (select auth.uid());
begin
  select * into v_cart from public.carts where id = p_cart_id;
  if v_cart.id is null then
    raise exception 'cart_not_found' using errcode = 'P0002';
  end if;

  if v_cart.user_id is not null then
    if v_user is null or v_cart.user_id <> v_user then
      raise exception 'cart_forbidden' using errcode = '42501';
    end if;
  else
    if p_guest_token is null or v_cart.guest_token <> p_guest_token then
      raise exception 'cart_forbidden' using errcode = '42501';
    end if;
  end if;

  return v_cart;
end;
$$;

-- ── Cart lifecycle ──────────────────────────────────────────────────────────
create or replace function public.get_or_create_cart(p_guest_token text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is not null then
    select id into v_id from public.carts where user_id = v_user;
    if v_id is null then
      insert into public.carts (user_id) values (v_user)
      on conflict (user_id) where user_id is not null do nothing
      returning id into v_id;
      if v_id is null then
        select id into v_id from public.carts where user_id = v_user;
      end if;
    end if;
    return v_id;
  end if;

  if p_guest_token is null or length(p_guest_token) < 16 then
    raise exception 'guest_token_required' using errcode = '22023';
  end if;

  select id into v_id from public.carts where guest_token = p_guest_token;
  if v_id is null then
    insert into public.carts (guest_token) values (p_guest_token)
    on conflict (guest_token) where guest_token is not null do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.carts where guest_token = p_guest_token;
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.cart_add_item(
  p_cart_id uuid,
  p_product_id uuid,
  p_variant_id uuid default null,
  p_quantity integer default 1,
  p_guest_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qty integer := greatest(1, least(coalesce(p_quantity, 1), 99));
  v_available integer;
  v_existing integer := 0;
begin
  perform public.assert_cart_access(p_cart_id, p_guest_token);

  -- The product must be purchasable. Checked here so an inactive product can
  -- never enter a cart in the first place.
  if not exists (
    select 1 from public.products where id = p_product_id and status = 'active'
  ) then
    raise exception 'product_unavailable' using errcode = 'P0001';
  end if;

  if p_variant_id is not null then
    select v.stock into v_available from public.product_variants v
    where v.id = p_variant_id and v.product_id = p_product_id and v.is_active;
    if v_available is null then
      raise exception 'variant_unavailable' using errcode = 'P0001';
    end if;
  else
    select p.stock into v_available from public.products p where p.id = p_product_id;
  end if;

  select coalesce(quantity, 0) into v_existing
  from public.cart_items
  where cart_id = p_cart_id
    and product_id = p_product_id
    and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_variant_id, '00000000-0000-0000-0000-000000000000'::uuid);

  if coalesce(v_available, 0) <= 0 then
    raise exception 'out_of_stock' using errcode = 'P0001';
  end if;

  -- Clamp instead of failing: adding a 3rd unit when 2 are left should leave
  -- the customer with 2 in the cart and a message, not an error page.
  v_qty := least(v_qty + coalesce(v_existing, 0), v_available, 99);

  insert into public.cart_items (cart_id, product_id, variant_id, quantity)
  values (p_cart_id, p_product_id, p_variant_id, v_qty)
  on conflict (cart_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set quantity = v_qty;

  return jsonb_build_object('quantity', v_qty, 'clamped', v_qty < (coalesce(v_existing, 0) + greatest(1, least(coalesce(p_quantity, 1), 99))));
end;
$$;

create or replace function public.cart_set_quantity(
  p_cart_id uuid,
  p_cart_item_id uuid,
  p_quantity integer,
  p_guest_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.cart_items;
  v_available integer;
  v_qty integer;
begin
  perform public.assert_cart_access(p_cart_id, p_guest_token);

  select * into v_item from public.cart_items
  where id = p_cart_item_id and cart_id = p_cart_id;
  if v_item.id is null then
    raise exception 'cart_item_not_found' using errcode = 'P0002';
  end if;

  if p_quantity <= 0 then
    delete from public.cart_items where id = p_cart_item_id;
    return jsonb_build_object('removed', true);
  end if;

  if v_item.variant_id is not null then
    select stock into v_available from public.product_variants where id = v_item.variant_id;
  else
    select stock into v_available from public.products where id = v_item.product_id;
  end if;

  v_qty := least(p_quantity, greatest(coalesce(v_available, 0), 0), 99);
  if v_qty <= 0 then
    delete from public.cart_items where id = p_cart_item_id;
    return jsonb_build_object('removed', true, 'reason', 'out_of_stock');
  end if;

  update public.cart_items set quantity = v_qty where id = p_cart_item_id;
  return jsonb_build_object('quantity', v_qty, 'clamped', v_qty < p_quantity);
end;
$$;

create or replace function public.cart_remove_item(
  p_cart_id uuid,
  p_cart_item_id uuid,
  p_guest_token text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_cart_access(p_cart_id, p_guest_token);
  delete from public.cart_items where id = p_cart_item_id and cart_id = p_cart_id;
end;
$$;

create or replace function public.cart_clear(p_cart_id uuid, p_guest_token text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_cart_access(p_cart_id, p_guest_token);
  delete from public.cart_items where cart_id = p_cart_id;
  update public.carts set coupon_code = null where id = p_cart_id;
end;
$$;

-- Applying a coupon validates it through quote_cart so the rules live in one
-- place. Returns the fresh quote; the code is only persisted if it was valid.
create or replace function public.cart_apply_coupon(
  p_cart_id uuid,
  p_code text,
  p_district text default null,
  p_guest_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote jsonb;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  perform public.assert_cart_access(p_cart_id, p_guest_token);

  if v_code = '' then
    update public.carts set coupon_code = null where id = p_cart_id;
    return public.quote_cart(p_cart_id, p_district, null);
  end if;

  v_quote := public.quote_cart(p_cart_id, p_district, v_code);

  if v_quote ->> 'coupon_error' is null and v_quote -> 'coupon' is not null then
    update public.carts set coupon_code = v_code where id = p_cart_id;
  else
    update public.carts set coupon_code = null where id = p_cart_id;
  end if;

  return v_quote;
end;
$$;

-- Guest → user cart merge on sign-in. Quantities are summed and clamped to
-- available stock; the guest cart is destroyed.
create or replace function public.merge_guest_cart(p_guest_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_guest_cart uuid;
  v_user_cart uuid;
begin
  if v_user is null or p_guest_token is null then
    return null;
  end if;

  select id into v_guest_cart from public.carts
  where guest_token = p_guest_token and user_id is null;
  if v_guest_cart is null then
    return public.get_or_create_cart(null);
  end if;

  v_user_cart := public.get_or_create_cart(null);

  insert into public.cart_items (cart_id, product_id, variant_id, quantity)
  select v_user_cart, gi.product_id, gi.variant_id, gi.quantity
  from public.cart_items gi
  where gi.cart_id = v_guest_cart
  on conflict (cart_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set quantity = least(cart_items.quantity + excluded.quantity, 99);

  -- Carry the guest's coupon across only if the user cart has none.
  update public.carts u
     set coupon_code = coalesce(u.coupon_code, g.coupon_code)
    from public.carts g
   where u.id = v_user_cart and g.id = v_guest_cart;

  delete from public.carts where id = v_guest_cart;

  -- Clamp anything that now exceeds stock.
  update public.cart_items ci
     set quantity = least(ci.quantity, greatest(coalesce(v.stock, p.stock, 0), 0))
    from public.products p
    left join public.product_variants v on v.id = ci.variant_id
   where ci.cart_id = v_user_cart and p.id = ci.product_id
     and ci.quantity > greatest(coalesce(v.stock, p.stock, 0), 0);

  delete from public.cart_items where cart_id = v_user_cart and quantity <= 0;

  return v_user_cart;
end;
$$;

-- Wishlist merge for the same sign-in moment. Guest wishlists live in
-- localStorage; the client hands the ids over once.
create or replace function public.merge_guest_wishlist(p_product_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer := 0;
begin
  if v_user is null or p_product_ids is null then
    return 0;
  end if;

  with inserted as (
    insert into public.wishlist_items (user_id, product_id)
    select v_user, pid from unnest(p_product_ids) pid
    where exists (select 1 from public.products p where p.id = pid and p.status = 'active')
    on conflict (user_id, product_id) do nothing
    returning 1
  )
  select count(*) into v_count from inserted;

  return v_count;
end;
$$;

create or replace function public.toggle_wishlist(p_product_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_deleted integer;
begin
  if v_user is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  delete from public.wishlist_items
  where user_id = v_user and product_id = p_product_id;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    return false;
  end if;

  insert into public.wishlist_items (user_id, product_id) values (v_user, p_product_id)
  on conflict do nothing;
  return true;
end;
$$;

create or replace function public.record_product_view(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    return;
  end if;
  insert into public.recently_viewed (user_id, product_id, viewed_at)
  values (v_user, p_product_id, now())
  on conflict (user_id, product_id) do update set viewed_at = now();
end;
$$;

grant execute on function public.get_or_create_cart(text) to anon, authenticated;
grant execute on function public.cart_add_item(uuid, uuid, uuid, integer, text) to anon, authenticated;
grant execute on function public.cart_set_quantity(uuid, uuid, integer, text) to anon, authenticated;
grant execute on function public.cart_remove_item(uuid, uuid, text) to anon, authenticated;
grant execute on function public.cart_clear(uuid, text) to anon, authenticated;
grant execute on function public.cart_apply_coupon(uuid, text, text, text) to anon, authenticated;
grant execute on function public.merge_guest_cart(text) to authenticated;
grant execute on function public.merge_guest_wishlist(uuid[]) to authenticated;
grant execute on function public.toggle_wishlist(uuid) to authenticated;
grant execute on function public.record_product_view(uuid) to authenticated;
revoke all on function public.assert_cart_access(uuid, text) from anon, authenticated;

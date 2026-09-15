-- ============================================================================
-- 0022  Drop the stale place_order overloads
-- ============================================================================
-- Order placement was failing for every customer with "We could not place your
-- order."
--
-- Cause: `create or replace function` only replaces when the argument list
-- matches EXACTLY. Migrations 0017, 0020 and 0021 each appended a parameter
-- (p_partial_payment, p_use_credit, p_use_credit_account), so instead of
-- replacing place_order they each created a NEW function beside the old one.
-- Four overloads ended up on the same name, and PostgREST cannot pick between
-- them by named arguments -- it refuses with "Could not choose the best
-- candidate function", which the action reported as a generic failure.
--
-- Postgres itself is fine with the overloads; it is the RPC layer that cannot
-- resolve them. Nothing was wrong with the newest definition, so this drops
-- the three obsolete ones and leaves it.
--
-- The lesson, for the next person adding an argument: drop the old signature
-- explicitly in the same migration, exactly as 0016 already does for
-- quote_cart. `create or replace` is not enough when the signature changes.
--
-- Idempotent: each drop names a full signature and is `if exists`.

-- 0014's signature (before partial payment).
drop function if exists public.place_order(
  uuid, text, text, text, text, text, text, text, text,
  public.payment_method, text, uuid, text, boolean
);

-- 0017 added p_partial_payment.
drop function if exists public.place_order(
  uuid, text, text, text, text, text, text, text, text,
  public.payment_method, text, uuid, text, boolean, boolean
);

-- 0020 added p_use_credit.
drop function if exists public.place_order(
  uuid, text, text, text, text, text, text, text, text,
  public.payment_method, text, uuid, text, boolean, boolean, boolean
);

-- What survives is 0021's: ..., p_partial_payment, p_use_credit,
-- p_use_credit_account. Re-grant, because dropping siblings does not touch it
-- but a fresh environment applying these in order needs the grant to land on
-- the one definition that remains.
grant execute on function public.place_order(
  uuid, text, text, text, text, text, text, text, text,
  public.payment_method, text, uuid, text, boolean, boolean, boolean, boolean
) to anon, authenticated;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_order';

  if v_count <> 1 then
    raise exception 'place_order must have exactly one signature, found %', v_count;
  end if;
end;
$$;

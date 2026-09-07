-- ============================================================================
-- 0012  Storage buckets and object policies
-- ============================================================================
-- Four buckets, all public-read because product photography is meant to be
-- served from the CDN without a signed-URL round trip. Writes are the part that
-- matters:
--
--   product-images / category-images / banners → staff only.
--   review-images                              → the customer who owns the
--                                                review, and only under a path
--                                                that starts with their uid.
--
-- The uid path prefix is what makes the last rule enforceable: storage has no
-- foreign key back to reviews, so ownership has to be encoded in the object
-- name. Uploads go to `<uid>/<review_id>/<file>`; the policy checks token 1.
--
-- MIME allow-lists are set on the bucket so a rename cannot smuggle an SVG (and
-- with it inline script) past the image pipeline.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images',  'product-images',  true, 5242880,
   array['image/jpeg','image/png','image/webp','image/avif']),
  ('category-images', 'category-images', true, 2097152,
   array['image/jpeg','image/png','image/webp','image/avif']),
  ('banners',         'banners',         true, 5242880,
   array['image/jpeg','image/png','image/webp','image/avif']),
  ('review-images',   'review-images',   true, 3145728,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects already has RLS enabled by Supabase; the policies below are
-- additive to whatever the platform ships.
create or replace function public.drop_storage_policy_if_exists(p_policy text)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on storage.objects', p_policy);
end $$;

-- ── Public read ─────────────────────────────────────────────────────────────
select public.drop_storage_policy_if_exists('bidyut_public_read');
create policy bidyut_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('product-images', 'category-images', 'banners', 'review-images'));

-- ── Catalog assets: staff write ─────────────────────────────────────────────
select public.drop_storage_policy_if_exists('bidyut_staff_write');
create policy bidyut_staff_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('product-images', 'category-images', 'banners')
    and public.is_staff()
  );

select public.drop_storage_policy_if_exists('bidyut_staff_update');
create policy bidyut_staff_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('product-images', 'category-images', 'banners')
    and public.is_staff()
  )
  with check (
    bucket_id in ('product-images', 'category-images', 'banners')
    and public.is_staff()
  );

select public.drop_storage_policy_if_exists('bidyut_staff_delete');
create policy bidyut_staff_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('product-images', 'category-images', 'banners')
    and public.is_staff()
  );

-- ── Review photos: owner-scoped by path prefix ──────────────────────────────
select public.drop_storage_policy_if_exists('bidyut_review_upload');
create policy bidyut_review_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'review-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

select public.drop_storage_policy_if_exists('bidyut_review_delete');
create policy bidyut_review_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'review-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_staff()
    )
  );

drop function if exists public.drop_storage_policy_if_exists(text);

-- ── Convenience: resolve a stored path to its public URL ────────────────────
-- Used by seed data and by the admin uploader so the URL shape lives in exactly
-- one place. Reads the project URL from a setting rather than hardcoding a ref.
create or replace function public.storage_public_url(p_bucket text, p_path text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_path is null or p_path = '' then null
    when p_path like 'http%' then p_path
    else coalesce(
      (select value #>> '{}' from public.settings where key = 'supabase_url'),
      ''
    ) || '/storage/v1/object/public/' || p_bucket || '/' || p_path
  end;
$$;

grant execute on function public.storage_public_url(text, text) to anon, authenticated;

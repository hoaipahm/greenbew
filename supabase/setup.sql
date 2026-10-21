-- Run in your own Supabase project's SQL Editor. No billing setup is needed.
-- This creates a new store; it does not read, change or delete Firebase data.
begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists private.hoai_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict
);
revoke all on private.hoai_owner from public, anon, authenticated;

-- The only definer helper lives outside the exposed public API schema.
create or replace function private.hoai_is_owner()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from private.hoai_owner where singleton and user_id = auth.uid()
  );
$$;
revoke all on function private.hoai_is_owner() from public;
grant execute on function private.hoai_is_owner() to authenticated;

create or replace function private.hoai_valid_snapshot(snapshot jsonb)
returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare
  item jsonb;
  field text;
begin
  if snapshot is null or jsonb_typeof(snapshot) is distinct from 'object'
    or octet_length(snapshot::text) > 8388608 then return false; end if;
  if not (snapshot ?& array['avatar','bio','lifeState','posts','gallery'])
    or (select count(*) from jsonb_object_keys(snapshot)) <> 5 then return false; end if;
  foreach field in array array['avatar','bio','lifeState'] loop
    if jsonb_typeof(snapshot -> field) is distinct from 'string' then return false; end if;
  end loop;
  if length(snapshot ->> 'avatar') > 4096 or length(snapshot ->> 'bio') > 10000
    or snapshot ->> 'lifeState' not in ('ALIVE','DIE') then return false; end if;
  if jsonb_typeof(snapshot -> 'posts') is distinct from 'array'
    or jsonb_typeof(snapshot -> 'gallery') is distinct from 'array' then return false; end if;
  if jsonb_array_length(snapshot -> 'posts') > 2000
    or jsonb_array_length(snapshot -> 'gallery') > 5000 then return false; end if;

  for item in select value from jsonb_array_elements(snapshot -> 'posts') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(item)) <> 9 then return false; end if;
    foreach field in array array['id','stamp','title','category','mood','style','date','image','content'] loop
      if jsonb_typeof(item -> field) is distinct from 'string' then return false; end if;
    end loop;
    if item ->> 'id' !~ '^[a-zA-Z0-9_-]{1,100}$'
      or length(item ->> 'title') not between 1 and 500
      or length(item ->> 'content') not between 1 and 300000
      or length(item ->> 'image') > 4096
      or length(item ->> 'category') > 100 or length(item ->> 'mood') > 100
      or length(item ->> 'date') > 100 or length(item ->> 'stamp') > 100
      or item ->> 'style' not in ('dark','kraft') then return false; end if;
  end loop;
  if (select count(distinct value ->> 'id') from jsonb_array_elements(snapshot -> 'posts'))
    <> jsonb_array_length(snapshot -> 'posts') then return false; end if;

  for item in select value from jsonb_array_elements(snapshot -> 'gallery') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(item)) <> 3 then return false; end if;
    foreach field in array array['id','title','src'] loop
      if jsonb_typeof(item -> field) is distinct from 'string' then return false; end if;
    end loop;
    if item ->> 'id' !~ '^[a-zA-Z0-9_-]{1,100}$' or length(item ->> 'title') > 500
      or length(item ->> 'src') > 4096 then return false; end if;
  end loop;
  if (select count(distinct value ->> 'id') from jsonb_array_elements(snapshot -> 'gallery'))
    <> jsonb_array_length(snapshot -> 'gallery') then return false; end if;
  return true;
end;
$$;
revoke all on function private.hoai_valid_snapshot(jsonb) from public;
grant execute on function private.hoai_valid_snapshot(jsonb) to authenticated;

-- A bounded personal archive uses one atomic snapshot containing text and URLs.
-- Image bytes live in Storage, and drafts never reach this public table.
create table if not exists public.hoai_site (
  id smallint primary key check (id = 1),
  payload jsonb not null check (private.hoai_valid_snapshot(payload)),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
alter table public.hoai_site enable row level security;
revoke all on public.hoai_site from public, anon, authenticated;
grant select on public.hoai_site to anon, authenticated;
grant insert, update on public.hoai_site to authenticated;

drop policy if exists hoai_public_read on public.hoai_site;
create policy hoai_public_read on public.hoai_site for select to anon, authenticated using (true);
drop policy if exists hoai_owner_insert on public.hoai_site;
create policy hoai_owner_insert on public.hoai_site for insert to authenticated
  with check ((select private.hoai_is_owner()));
drop policy if exists hoai_owner_update on public.hoai_site;
create policy hoai_owner_update on public.hoai_site for update to authenticated
  using ((select private.hoai_is_owner())) with check ((select private.hoai_is_owner()));

-- Invoker function: grants and RLS remain in force, even through the RPC endpoint.
create or replace function public.hoai_save(p_snapshot jsonb, p_expected_revision uuid)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare saved_revision uuid;
begin
  if not private.hoai_is_owner() then
    raise exception 'Owner only' using errcode = '42501';
  end if;
  if not private.hoai_valid_snapshot(p_snapshot) then
    raise exception 'Invalid public snapshot' using errcode = '22023';
  end if;
  if p_expected_revision is null then
    insert into public.hoai_site (id, payload) values (1, p_snapshot)
      on conflict (id) do nothing returning revision into saved_revision;
  else
    update public.hoai_site set payload = p_snapshot,
      revision = gen_random_uuid(), updated_at = now()
      where id = 1 and revision = p_expected_revision
      returning revision into saved_revision;
  end if;
  if saved_revision is null then
    raise exception 'Archive changed on another device' using errcode = '40001';
  end if;
  return saved_revision;
end;
$$;
revoke all on function public.hoai_save(jsonb, uuid) from public, anon;
grant execute on function public.hoai_save(jsonb, uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hoai-images', 'hoai-images', true, 20971520,
  array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hoai_images_read on storage.objects;
create policy hoai_images_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'hoai-images');
drop policy if exists hoai_images_insert on storage.objects;
create policy hoai_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hoai-images' and (select private.hoai_is_owner())
    and name ~ '^images/[a-f0-9]{64}\.(jpeg|png|webp|gif)$');
drop policy if exists hoai_images_delete on storage.objects;
create policy hoai_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hoai-images' and (select private.hoai_is_owner()));

commit;

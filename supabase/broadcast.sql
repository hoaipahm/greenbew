-- Run once in this project's Supabase SQL Editor after setup.sql.
-- Adds scheduled broadcasts only; does not alter posts, images or owner identity.
begin;

create table if not exists public.hoai_broadcast (
  hour smallint primary key check (hour between 0 and 22 and hour % 2 = 0),
  title_vi text not null check (length(trim(title_vi)) between 1 and 160),
  title_en text not null check (length(trim(title_en)) between 1 and 160),
  body_vi text not null check (length(trim(body_vi)) between 1 and 2000),
  body_en text not null check (length(trim(body_en)) between 1 and 2000),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
alter table public.hoai_broadcast enable row level security;
revoke all on public.hoai_broadcast from public, anon, authenticated;
grant select on public.hoai_broadcast to anon, authenticated;
grant insert, update on public.hoai_broadcast to authenticated;

drop policy if exists hoai_broadcast_read on public.hoai_broadcast;
create policy hoai_broadcast_read on public.hoai_broadcast for select to anon, authenticated using (true);
drop policy if exists hoai_broadcast_insert on public.hoai_broadcast;
create policy hoai_broadcast_insert on public.hoai_broadcast for insert to authenticated
  with check ((select private.hoai_is_owner()));
drop policy if exists hoai_broadcast_update on public.hoai_broadcast;
create policy hoai_broadcast_update on public.hoai_broadcast for update to authenticated
  using ((select private.hoai_is_owner())) with check ((select private.hoai_is_owner()));

create or replace function public.hoai_save_broadcast(
  p_hour smallint, p_title_vi text, p_title_en text, p_body_vi text, p_body_en text,
  p_expected_revision uuid
)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare saved_revision uuid;
begin
  if not private.hoai_is_owner() then
    raise exception 'Owner only' using errcode = '42501';
  end if;
  if p_expected_revision is null then
    insert into public.hoai_broadcast (hour, title_vi, title_en, body_vi, body_en)
      values (p_hour, p_title_vi, p_title_en, p_body_vi, p_body_en)
      on conflict (hour) do nothing returning revision into saved_revision;
  else
    update public.hoai_broadcast set title_vi = p_title_vi, title_en = p_title_en,
      body_vi = p_body_vi, body_en = p_body_en, revision = gen_random_uuid(), updated_at = now()
      where hour = p_hour and revision = p_expected_revision returning revision into saved_revision;
  end if;
  if saved_revision is null then
    raise exception 'Broadcast changed on another device' using errcode = '40001';
  end if;
  return saved_revision;
end;
$$;
revoke all on function public.hoai_save_broadcast(smallint,text,text,text,text,uuid) from public, anon;
grant execute on function public.hoai_save_broadcast(smallint,text,text,text,text,uuid) to authenticated;

commit;

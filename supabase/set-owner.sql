-- Run AFTER creating your owner account in Authentication > Users.
-- Never put a password or service_role key here.
insert into private.hoai_owner (singleton, user_id)
values (true, '3f8c4624-1501-4492-a021-f2dd419046da'::uuid)
on conflict (singleton) do update set user_id = excluded.user_id;

-- 1. One display name instead of first/last.
-- 2. Close the role-trigger landmine: read role from admin-only
--    raw_app_meta_data, never from user-writable raw_user_meta_data. With
--    sign-up enabled, the old trigger let anyone register as label_member.
-- public.users.role stays the source of truth; app_metadata.role is only read
-- when it is set or changed (see the update trigger below).

alter table public.users add column name text;

update public.users
  set name = nullif(trim(concat_ws(' ', first_name, last_name)), '');

-- Revoking the table privilege also revokes the existing column grants.
revoke select on public.users from authenticated;

alter table public.users
  drop column first_name,
  drop column last_name;

grant select (id, name, created_at)
  on public.users
  to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, role)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'listener')
  );
  return new;
end;
$$;

-- GoTrue's admin createUser inserts the auth.users row first and writes the
-- supplied app_metadata in a follow-up UPDATE, so the insert trigger above
-- never sees the role. Apply it when app_metadata.role is set or changed.
-- app_metadata is admin-only, so this is safe; unrelated app_metadata updates
-- (e.g. provider changes at sign-in) leave the role value unchanged and no-op.
create or replace function public.sync_user_role_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
    set role = (new.raw_app_meta_data ->> 'role')::public.user_role
    where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_app_metadata_role_changed
  after update of raw_app_meta_data on auth.users
  for each row
  when (
    new.raw_app_meta_data ->> 'role' is not null
    and new.raw_app_meta_data ->> 'role' is distinct from old.raw_app_meta_data ->> 'role'
  )
  execute function public.sync_user_role_from_app_metadata();

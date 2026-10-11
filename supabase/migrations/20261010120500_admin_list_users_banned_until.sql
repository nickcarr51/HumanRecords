-- Deactivating a user = Supabase auth ban (reversible, keeps download
-- history). The admin users table needs to show it, so admin_list_users
-- also returns auth.users.banned_until. A return-type change needs drop +
-- create; the deployed code ignores the extra column.

drop function public.admin_list_users();

create function public.admin_list_users()
returns table (
  id uuid,
  email text,
  name text,
  role public.user_role,
  created_at timestamptz,
  invite_token text,
  invite_used_at timestamptz,
  banned_until timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can list users.' using errcode = '42501';
  end if;

  return query
    select u.id, au.email::text, u.name, u.role, u.created_at, i.token, i.used_at, au.banned_until
    from public.users u
    join auth.users au on au.id = u.id
    left join public.invites i on i.user_id = u.id
    order by u.created_at desc;
end;
$$;

revoke execute on function public.admin_list_users() from public;
revoke execute on function public.admin_list_users() from anon;
grant execute on function public.admin_list_users() to authenticated;

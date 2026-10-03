-- Single-use invite tokens for /login?email=&invite=. One row per user;
-- regenerating overwrites the token. Tokens are stored in plaintext so the
-- admin table can re-show the URL — so NO role but the service role (and the
-- definer functions below) may touch this table.
create table public.invites (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text unique,
  used_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

-- Admin users table: every user with email (from auth.users), name, role and
-- invite state. Label members only.
create function public.admin_list_users()
returns table (
  id uuid,
  email text,
  name text,
  role public.user_role,
  created_at timestamptz,
  invite_token text,
  invite_used_at timestamptz
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
    select u.id, au.email::text, u.name, u.role, u.created_at, i.token, i.used_at
    from public.users u
    join auth.users au on au.id = u.id
    left join public.invites i on i.user_id = u.id
    order by u.created_at desc;
end;
$$;

revoke execute on function public.admin_list_users() from public;
revoke execute on function public.admin_list_users() from anon;
grant execute on function public.admin_list_users() to authenticated;

-- Inline role edit. Label members only, never on yourself (no self-lockout).
create function public.admin_set_user_role(target uuid, new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can change roles.' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'You can''t change your own role.' using errcode = '22023';
  end if;

  update public.users set role = new_role where id = target;
  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.admin_set_user_role(uuid, public.user_role) from public;
revoke execute on function public.admin_set_user_role(uuid, public.user_role) from anon;
grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;

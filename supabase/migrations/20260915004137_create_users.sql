create extension if not exists "pgcrypto";

create type public.user_role as enum ('listener', 'artist', 'label_member');

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  role public.user_role not null default 'listener',
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "authenticated users can read users"
  on public.users for select
  to authenticated
  using (true);

-- Auto-create a user row whenever a new auth.users row appears, whether
-- from an admin invite or (in the future) self-signup. Role/name come from
-- the invite call's user_metadata; role falls back to 'listener'.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, first_name, last_name, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'listener')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

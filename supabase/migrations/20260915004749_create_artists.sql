create table public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bio text,
  profile_photo_url text,
  -- unique: an account should back at most one artist row. Nullable-safe —
  -- Postgres allows any number of NULLs under a unique constraint, so
  -- unsigned artists (user_id null) are unaffected.
  user_id uuid unique references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.artists enable row level security;

create policy "authenticated users can read artists"
  on public.artists for select
  to authenticated
  using (true);

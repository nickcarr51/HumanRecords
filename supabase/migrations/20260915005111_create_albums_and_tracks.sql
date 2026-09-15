create table public.albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  album_art_url text,
  created_at timestamptz not null default now()
);

alter table public.albums enable row level security;

create policy "authenticated users can read albums"
  on public.albums for select
  to authenticated
  using (true);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  track_art_url text,
  audio_url text not null,
  play_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tracks enable row level security;

create policy "authenticated users can read tracks"
  on public.tracks for select
  to authenticated
  using (true);

-- Sole write path for play_count. security definer bypasses the (currently
-- nonexistent) update policy on tracks so plays don't require opening up
-- general write access to the table.
create function public.increment_play_count(p_track_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tracks set play_count = play_count + 1 where id = p_track_id;
$$;

grant execute on function public.increment_play_count(uuid) to authenticated;

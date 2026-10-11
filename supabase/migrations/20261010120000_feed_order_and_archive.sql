-- Feed ordering + soft delete (v1 finish).
--
-- pinned / sort_at: the feed orders by pinned first, then sort_at, newest
-- first. Admins reorder by swapping sort_at (move_release). sort_at starts
-- equal to created_at, so new releases still land on top of the unpinned
-- group and the deployed code's newest-first order is unchanged.
--
-- archived_at: soft delete for releases and tracks. Prod R2 never deletes,
-- and a hard delete would cascade away download history. Archived rows are
-- hidden from listeners by RLS; label members still read them (admin UI).

alter table public.releases add column pinned boolean not null default false;
alter table public.releases add column sort_at timestamptz;
alter table public.releases add column archived_at timestamptz;
alter table public.tracks add column archived_at timestamptz;

update public.releases set sort_at = created_at;

-- A column default can't reference another column, so fill sort_at from
-- created_at on insert when the caller omits it (publish_release does).
create function public.releases_default_sort_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sort_at is null then
    new.sort_at := new.created_at;
  end if;
  return new;
end;
$$;

create trigger releases_default_sort_at
  before insert on public.releases
  for each row execute function public.releases_default_sort_at();

alter table public.releases alter column sort_at set not null;

-- created_at is the real upload date; sort_at is the movable one. Lock
-- created_at so nothing (admin UI, a stray update) can rewrite history.
-- Inserts may still set it explicitly (tests, backfills).
create function public.keep_created_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger releases_keep_created_at
  before update of created_at on public.releases
  for each row execute function public.keep_created_at();
create trigger tracks_keep_created_at
  before update of created_at on public.tracks
  for each row execute function public.keep_created_at();
create trigger albums_keep_created_at
  before update of created_at on public.albums
  for each row execute function public.keep_created_at();

create index releases_feed_order_idx
  on public.releases (pinned desc, sort_at desc, id desc)
  where archived_at is null;

-- Tightening a read policy is safe here: nothing is archived yet, so the
-- deployed code sees exactly the same rows.
drop policy "authenticated users can read releases" on public.releases;
create policy "signed-in users read live releases; label members read all"
  on public.releases for select
  to authenticated
  using (archived_at is null or (select public.current_user_role()) = 'label_member');

drop policy "authenticated users can read tracks" on public.tracks;
create policy "signed-in users read live tracks; label members read all"
  on public.tracks for select
  to authenticated
  using (archived_at is null or (select public.current_user_role()) = 'label_member');

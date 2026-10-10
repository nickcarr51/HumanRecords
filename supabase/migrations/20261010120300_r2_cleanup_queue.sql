-- R2 objects that may no longer be needed: archived releases/tracks and
-- files replaced in the admin UI. Nothing deletes from R2 now (prod bucket
-- is delete-locked). A future cleanup job deletes only rows queued 30+ days
-- ago whose key no live row still references, then sets cleaned_at.
-- Service role only: RLS on, no policies, privileges revoked.

create table public.r2_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  object_key text not null,
  reason text not null check (reason in ('archived', 'replaced')),
  source_table text not null check (source_table in ('tracks', 'albums', 'artists')),
  source_id uuid not null,
  queued_at timestamptz not null default now(),
  cleaned_at timestamptz
);

alter table public.r2_cleanup_queue enable row level security;
revoke all on table public.r2_cleanup_queue from anon, authenticated;

create index r2_cleanup_queue_pending_idx
  on public.r2_cleanup_queue (queued_at)
  where cleaned_at is null;
create index r2_cleanup_queue_source_idx
  on public.r2_cleanup_queue (source_table, source_id);

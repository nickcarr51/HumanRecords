-- supabase/migrations/20261119120000_drop_replaced_functions.sql
-- Drizzle slice 4, database part.
-- 1. Drop the 11 SQL functions slices 1-3 replaced with TypeScript services
--    (src/lib/services, src/lib/supabase/feed.ts). The code deployed before
--    this migration runs no longer calls any of them. (deploy.yml applies
--    migrations before it deploys code; slices 1-3 are already live.)
--    publish_release, update_release, add_album_track and resolve_artist_refs
--    stay until the final cleanup: the code live when this runs still calls them.
-- 2. Signed-in and signed-out users (authenticated, anon) never need to
--    truncate a table, add a trigger, reference a table from a foreign key, or
--    run maintenance (vacuum, analyze, ...) on it. Supabase's default grants
--    gave them those rights on every public table; this takes them back, now
--    and for tables created later. Every public table is created by postgres
--    (the role migrations run as), so postgres's default grants are the ones
--    future tables get.
-- 3. Nobody updates public.users as a signed-in user: the app writes it with
--    the service role (createServiceClient, asSystem).

drop function public.search_feed;
drop function public.admin_list_users;
drop function public.admin_delete_artist;
drop function public.admin_set_user_role;
drop function public.archive_release;
drop function public.restore_release;
drop function public.archive_track;
drop function public.restore_track;
drop function public.replace_track_audio;
drop function public.move_release;
drop function public.release_for_track;

revoke truncate, trigger, references, maintain on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references, maintain on tables from anon, authenticated;

revoke update on public.users from anon, authenticated;

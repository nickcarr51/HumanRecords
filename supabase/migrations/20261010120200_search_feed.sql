-- Feed search. Returns matching releases as rows of public.releases so the
-- app can chain the same embedded select, order and range as the plain feed
-- (one ordering definition, in getFeed). Matching: case-insensitive
-- substring on track titles, album titles and credited artist names; an
-- album also matches through any of its live tracks. LIKE wildcards in the
-- query are escaped so "100%" means the literal text. security invoker:
-- RLS still hides archived rows from listeners; the explicit filters below
-- hide them from label members too.

create function public.search_feed(q text)
returns setof public.releases
language sql
stable
security invoker
set search_path = public
as $$
  with pat as (
    select '%' || replace(replace(replace(coalesce(q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as p
  )
  select r.*
  from public.releases r, pat
  where r.archived_at is null
    and (
      (r.kind = 'single' and exists (
        select 1 from public.tracks t
        where t.id = r.track_id
          and t.archived_at is null
          and (
            t.title ilike pat.p
            or exists (
              select 1 from public.track_artists ta
              join public.artists a on a.id = ta.artist_id
              where ta.track_id = t.id and a.name ilike pat.p
            )
          )
      ))
      or (r.kind = 'album' and exists (
        select 1 from public.albums al
        where al.id = r.album_id
          and (
            al.title ilike pat.p
            or exists (
              select 1 from public.album_artists aa
              join public.artists a on a.id = aa.artist_id
              where aa.album_id = al.id and a.name ilike pat.p
            )
            or exists (
              select 1 from public.track_albums tal
              join public.tracks t on t.id = tal.track_id
              where tal.album_id = al.id
                and t.archived_at is null
                and (
                  t.title ilike pat.p
                  or exists (
                    select 1 from public.track_artists ta
                    join public.artists a on a.id = ta.artist_id
                    where ta.track_id = t.id and a.name ilike pat.p
                  )
                )
            )
          )
      ))
    );
$$;

revoke execute on function public.search_feed(text) from public;
revoke execute on function public.search_feed(text) from anon;
grant execute on function public.search_feed(text) to authenticated;

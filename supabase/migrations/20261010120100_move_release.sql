-- Admin reorder: move a release one place up or down in the feed.
-- Feed order is (pinned desc, sort_at desc, id desc), so "up" is the
-- neighbour with the next-larger (sort_at, id) in the same pinned group.
-- Swapping sort_at in one function keeps the two updates atomic.
-- Ties: before the swap, every tied block (live rows, same pinned group)
-- sharing cur's or the neighbour's sort_at is spread into distinct values in
-- 1 ms steps, preserving feed order, so one click always moves exactly one
-- spot, even when a third row is tied with either of the two being swapped.

create function public.move_release(target uuid, direction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur public.releases%rowtype;
  nb public.releases%rowtype;
begin
  if public.current_user_role() is distinct from 'label_member' then
    raise exception 'Only label members can reorder releases.' using errcode = '42501';
  end if;
  if direction is null or direction not in ('up', 'down') then
    raise exception 'direction must be up or down' using errcode = '22023';
  end if;

  select * into cur from public.releases where id = target for update;
  if not found then
    raise exception 'Release not found.' using errcode = 'P0002';
  end if;
  if cur.archived_at is not null then
    raise exception 'Archived releases cannot be moved.' using errcode = '22023';
  end if;

  if direction = 'up' then
    select * into nb from public.releases r
    where r.pinned = cur.pinned and r.archived_at is null
      and (r.sort_at, r.id) > (cur.sort_at, cur.id)
    order by r.sort_at asc, r.id asc
    limit 1
    for update;
  else
    select * into nb from public.releases r
    where r.pinned = cur.pinned and r.archived_at is null
      and (r.sort_at, r.id) < (cur.sort_at, cur.id)
    order by r.sort_at desc, r.id desc
    limit 1
    for update;
  end if;

  if not found then
    return; -- already at the edge of its group
  end if;

  -- Make cur and nb distinct, and keep every other row out of the way, before
  -- swapping. Spread EVERY tied block in this pinned group whose sort_at equals
  -- cur.sort_at or nb.sort_at. Spreading only when cur and nb tie is not
  -- enough: with A and B tied at t and C at t-1 (feed order A, B, C), moving
  -- B down swaps B and C, so C takes t and ties with A; the id tiebreak then
  -- puts C above A and C has jumped two spots. Spreading both blocks first
  -- means every row involved has a unique sort_at, so the swap below hands cur
  -- and nb each other's unique value and cannot create a new tie.
  -- Spreading keeps live rows only and preserves the current feed order
  -- (sort_at desc, id desc): the top row of each block keeps its value t and
  -- each next row gets t - k steps. The step is 1 millisecond because
  -- JavaScript Date keeps only milliseconds; finer steps would collapse back
  -- into ties if sort_at is ever round-tripped through JS.
  update public.releases r
  set sort_at = s.t - (s.rn * interval '1 millisecond')
  from (
    select id, sort_at as t,
           row_number() over (partition by sort_at order by id desc) - 1 as rn
    from public.releases
    where pinned = cur.pinned and archived_at is null
      and sort_at in (cur.sort_at, nb.sort_at)
  ) s
  where r.id = s.id and s.rn > 0;

  select * into cur from public.releases where id = target;
  select * into nb from public.releases where id = nb.id;

  update public.releases set sort_at = nb.sort_at where id = cur.id;
  update public.releases set sort_at = cur.sort_at where id = nb.id;
end;
$$;

revoke execute on function public.move_release(uuid, text) from public;
revoke execute on function public.move_release(uuid, text) from anon;
grant execute on function public.move_release(uuid, text) to authenticated;

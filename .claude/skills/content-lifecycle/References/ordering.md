# Reference: Feed ordering

Migrations `20261010120000` (columns, trigger) and `20261010120100` (`move_release`). Tests:
`archive-schema.data.test.ts`, `move-release.data.test.ts`, `feed.data.test.ts`.

## The three columns

- `pinned boolean default false` — pinned releases sort above all unpinned ones.
- `sort_at timestamptz not null` — the movable position. Feed order is
  `pinned desc, sort_at desc, id desc` (`getFeed`, index `releases_feed_order_idx`).
- `created_at` — the real upload date, never changes. `keep_created_at` triggers on
  `releases`, `tracks`, `albums` reset it on update. Inserts may set it (tests, backfills).

`sort_at` is filled by the `releases_default_sort_at` before-insert trigger (`:= created_at`
when omitted; a column default can't read another column). `publish_release` omits it. So a
new upload lands at the top of the **unpinned** group and stays there only until the next
upload ("top until next upload"); **pin to stay above later uploads.**
Generated `releases.Insert` types still require `sort_at`.

## `move_release(target, direction)`

Definer, label members only (`42501`); `direction` is `up` or `down` (`22023` otherwise);
`P0002` for an unknown release; `22023` for an archived one.

1. Lock the target row, find the live neighbour in the **same pinned group** by `(sort_at, id)`.
2. At the group edge (top or bottom of its pinned group) return silently. Moving the top
   unpinned release "up" does not cross into the pinned group; pin/unpin changes groups.
3. If target and neighbour have the **same** `sort_at`, swapping would change nothing. First
   spread the whole tied block: the top row keeps `t`, each next row gets `t - k µs`, in current
   feed (id) order. Then swap. One click therefore always moves exactly one spot.
4. Swap the two `sort_at` values in one transaction.

Concurrent opposite moves can deadlock (`40P01`); callers should show a "try again" message.

## Search and ordering

`search_feed` returns plain `releases` rows and doesn't order them. The caller chains the same
`order`/`range` as `getFeed`. PostgREST orders an RPC result only by columns in the select
projection, which is why `RELEASE_SELECT` includes `pinned, sort_at`. An empty query matches
everything, so callers skip the RPC when `q` is empty.

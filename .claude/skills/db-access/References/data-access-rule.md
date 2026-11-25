# Reference: supabase-js or Drizzle

The rule for every query and mutation (owner, 2026-11-19). It replaced the 2026-10-28 rule that
drove the move off SQL functions ([slices.md](slices.md)).

## The rule

1. **Simple → supabase-js.** A query or mutation Supabase handles safely uses supabase-js: one
   read or write on one table, and every read that changes nothing, even across several tables.
   A read moves to Drizzle only when supabase-js can't do it safely, never to save a round trip.
2. **Complex → a Drizzle service.** Several changes that must all succeed or all fail (a
   transaction), or a job supabase-js can't do safely, is a service in `src/lib/services`:
   `authorize(viewer, action)`, then one `asSystem` transaction (or `asUser` for a read on the
   user's own behalf). How to add one: [running-queries.md](running-queries.md).
3. **Same PR.** The PR that makes supabase-js code complex also moves it to a Drizzle service.
   Example: an artist's name is saved with one `supabase.from("artists").update({ name })`. A
   feature that makes that save also change the artist's credits in one go turns it into a
   service in that feature's PR, so the two changes always land together.
4. **App logic lives in TypeScript.** New SQL functions are limited to triggers (`keep_created_at`,
   `track_in_one_place`, …) and RLS helpers (`current_user_role`). A multi-step write is a
   Drizzle service.

## "Can't do safely": the cases so far

- **The feed search** (`getFeed`): in a PostgREST filter a `*` is always a wildcard, and a
  production artist has `*` in their name.
- **The admin user list** (`listUsers`): emails live in `auth.users`, which a signed-in
  supabase-js call can't read.
- **Adding to a counter** when two requests can land at once (a future play count, for example):
  supabase-js writes a value it read first, so one of two simultaneous adds is lost.

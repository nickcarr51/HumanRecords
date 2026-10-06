# Reference: Migration rules

## Add-only, enforced

Migrations are forward-only. Never edit, rename, or delete one that is committed; add a new one
(`yarn supabase migration new <name>`). CI's `migrations` job fails any modified/renamed/deleted
file (a git rename counts as delete + add) and any new file whose timestamp is not newer than the
base branch's newest. Apply locally with `yarn supabase migration up`. Never use `--include-seed`
against a hosted DB; seed is local-only.

## Expand/contract

Migrations apply seconds before the new code deploys (and a rollback leaves the DB ahead of the
code), so every migration must keep the **currently deployed code** working. Additive changes
(new nullable column, new table, new function) are always safe. Anything that removes or
tightens takes two releases.

Worked example: rename `tracks.title` to `tracks.name`.

1. **Release 1 (expand):** migration adds `name`, backfills `update tracks set name = title`,
   and (optional) a trigger keeping both in sync. App reads `name` falling back to `title`
   (dual-read) and writes both. Deploy.
2. **Release 2 (contract):** once release 1 is live everywhere (develop and prod), app code
   uses only `name`. A new migration drops `title` (and the trigger). Deploy.

Same shape for dropping a column (release 1 stops using it; release 2 drops it), adding
`not null` (add nullable, backfill, then `set not null` next release), and tightening RLS.

## First rollout

Before the first deploy run, check hosted develop's history read-only
(`yarn supabase migration list --linked`; the guard hook prompts, ask the user). The first `main`
deploy applies every migration to the empty prod DB. If develop's history disagrees with the
repo, stop and decide with the user. **Never `migration repair` without explicit permission.**

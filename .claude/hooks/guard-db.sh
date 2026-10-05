#!/usr/bin/env bash
# PreToolUse(Bash) guard for HOSTED data: databases, R2 buckets, prod resource names.
# Any command that could write to, wipe, or delete a hosted Supabase database or R2 bucket,
# or name a production resource, needs the user's explicit approval: emits permissionDecision "ask"
# (forces a prompt even in auto mode). Local-only commands (`supabase db reset`,
# `migration up`, psql to 127.0.0.1) pass through untouched.
#
# Why hosted matters even from a laptop: this repo's Supabase CLI is linked to
# the hosted develop project, so `--linked` / `db push` reach real data.
# Fails open (no jq, bad JSON → allow); jq ships with macOS.

cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && exit 0

# One line, lowercase, `supabase@1.2.3` → `supabase` so patterns see the
# subcommand regardless of line continuations or pinned versions.
lc=$(printf '%s' "$cmd" | tr '\n\\' '  ' | tr '[:upper:]' '[:lower:]' | sed -E 's/supabase@[^[:space:]]+/supabase/g')
has() { printf '%s' "$lc" | grep -Eq -- "$1"; }

reason=""
if has 'supabase' && has '(^|[[:space:]])db[[:space:]]+push'; then
  reason="supabase db push writes migrations to a HOSTED database."
elif has 'supabase' && has '(--linked|--db-url|--project-ref)'; then
  reason="This supabase command targets a HOSTED database (--linked / --db-url / --project-ref)."
elif has 'supabase' && has '(projects|branches)[[:space:]]+delete'; then
  reason="Deletes a hosted Supabase project or branch."
elif has 'supabase' && has 'migration[[:space:]]+repair' && ! has '--local'; then
  reason="supabase migration repair rewrites a HOSTED database's migration history."
# psql / pg tools pointed at anything that isn't the local stack.
elif has '(psql|pg_dump|pg_restore|dropdb)' && has 'supabase\.(co|com)|pooler\.supabase'; then
  reason="Direct Postgres command against a HOSTED Supabase database."
# R2 deletions (any bucket) — prod media is locked, but dev/local data matters too.
elif has '(aws[[:space:]]+s3[[:space:]]+(rm|rb)|aws[[:space:]]+s3api[[:space:]]+delete-(object|objects|bucket)|rclone[[:space:]]+(delete|deletefile|purge|rmdir|rmdirs)|wrangler[[:space:]]+r2[[:space:]]+(object|bucket)[[:space:]]+delete)'; then
  reason="Deletes R2 objects or buckets."
# Anything naming production resources.
elif has '(media-prod|humanrecords-backups|gglrarflzvfxhdnjbnvt)'; then
  reason="Command references a PRODUCTION resource (prod media bucket, backups bucket, or prod Supabase project)."
fi

[ -z "$reason" ] && exit 0

jq -n --arg r "HOSTED DATA GUARD: $reason Never run this without the user's explicit permission in this conversation." '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: $r
  }
}'

// The most rows one list query returns, matching the cap PostgREST put on
// every supabase-js read (`max_rows = 1000` in supabase/config.toml, [api]).
// On the hosted projects that cap is a Supabase dashboard setting (API
// settings, "Max rows"), which the rollout checklist verifies.
export const MAX_ROWS = 1000;

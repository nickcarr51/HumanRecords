import "server-only";

// Server-only service-role client. Bypasses RLS — use ONLY for writes that
// have no user-scoped RLS insert policy (e.g. recording downloads). Never
// expose to the browser; never use for user-facing reads.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function createServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "./client";
import type { JwtClaims } from "@/lib/services/viewer";

// Supabase's docs set an 8s statement_timeout for the `authenticated` role,
// and the `postgres` role is capped by a 2-minute global timeout. The
// local stack's `authenticator` role also has lock_timeout = 8s (observed
// locally, not documented by Supabase). A direct Drizzle connection logs in as
// `postgres`, so it doesn't get the authenticated/authenticator 8s settings,
// only the 2-minute global cap. So asUser and asSystem both set 10s for
// statement_timeout and lock_timeout per transaction. 10s is the owner's
// choice (2026-10-24).
const QUERY_TIMEOUT = "10s";

// Everything a transaction needs before its first query, in ONE statement (one
// round trip). Every set_config is transaction-local (is_local = true), so
// nothing outlives the transaction. With claims (asUser, which runs the query
// as the signed-in user) it also switches to the `authenticated` role and sets
// request.jwt.claims to only { sub, role: "authenticated" }, so auth.uid() and
// the database's normal permission rules (RLS) apply exactly as they do
// through PostgREST. Only the user id is sent because the database reads
// nothing else (auth.uid() reads request.jwt.claims ->> 'sub'; no policy reads
// another claim), and a failed query's logged params then contain only the
// user id, never name, phone or session. Without claims (asSystem, admin
// access) it sets only the timeouts.
export async function prepareTransaction(tx: Tx, claims?: JwtClaims): Promise<void> {
  if (claims) {
    await tx.execute(
      sql`select set_config('statement_timeout', ${QUERY_TIMEOUT}, true), set_config('lock_timeout', ${QUERY_TIMEOUT}, true), set_config('request.jwt.claims', ${JSON.stringify({ sub: claims.sub, role: "authenticated" })}, true), set_config('role', 'authenticated', true)`,
    );
    return;
  }
  await tx.execute(
    sql`select set_config('statement_timeout', ${QUERY_TIMEOUT}, true), set_config('lock_timeout', ${QUERY_TIMEOUT}, true)`,
  );
}

import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "./client";
import type { JwtClaims } from "@/lib/services/viewer";

// Today every read goes through PostgREST, which applies the `authenticated`
// role's statement_timeout (8s) and the authenticator's lock_timeout (8s).
// A direct Drizzle connection has neither, so both doors set them per
// transaction. 10s is the owner's choice (2026-10-24).
export const QUERY_TIMEOUT = "10s";

// Everything a door sets up, in ONE statement (one round trip). Every
// set_config is transaction-local (is_local = true), so nothing outlives the
// transaction. With claims (Door 1) it also sets the verified claims and
// switches to the `authenticated` role, so auth.uid() and RLS apply exactly as
// they do through PostgREST. Without claims (Door 2) it sets only the timeouts.
export async function doorSetup(tx: Tx, claims?: JwtClaims): Promise<void> {
  if (claims) {
    await tx.execute(
      sql`select set_config('statement_timeout', ${QUERY_TIMEOUT}, true), set_config('lock_timeout', ${QUERY_TIMEOUT}, true), set_config('request.jwt.claims', ${JSON.stringify(claims)}, true), set_config('role', 'authenticated', true)`,
    );
    return;
  }
  await tx.execute(
    sql`select set_config('statement_timeout', ${QUERY_TIMEOUT}, true), set_config('lock_timeout', ${QUERY_TIMEOUT}, true)`,
  );
}

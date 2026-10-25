import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "./client";
import type { JwtClaims } from "@/lib/services/viewer";

// A read through PostgREST gets the `authenticated` role's statement_timeout
// (8s) and the authenticator's lock_timeout (8s). A direct Drizzle connection
// has neither, so both doors set them per transaction. 10s is the owner's
// choice (2026-10-24).
export const QUERY_TIMEOUT = "10s";

// Everything a door sets up, in ONE statement (one round trip). Every
// set_config is transaction-local (is_local = true), so nothing outlives the
// transaction. With claims (Door 1) it also switches to the `authenticated`
// role and sets request.jwt.claims to only { sub, role: "authenticated" }, so
// auth.uid() and RLS apply exactly as they do through PostgREST. Only the user
// id is sent because the database reads nothing else (auth.uid() reads
// request.jwt.claims ->> 'sub'; no policy reads another claim), and a failed
// query's logged params then contain only the user id, never name, phone or
// session. Without claims (Door 2) it sets only the timeouts.
export async function doorSetup(tx: Tx, claims?: JwtClaims): Promise<void> {
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

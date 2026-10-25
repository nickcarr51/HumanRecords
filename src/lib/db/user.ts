import "server-only";
import { sql } from "drizzle-orm";
import { getDb, type Db, type Tx } from "./client";
import { applyTimeouts } from "./timeouts";
import type { JwtClaims } from "@/lib/services/viewer";

// Door 1: RLS on. Same identity PostgREST would use: the `authenticated` role
// plus the verified claims, so auth.uid(), current_user_role() and every policy
// apply. Both settings are transaction-local, so nothing outlives the transaction.
// `db` is injectable for the connection-leak test only.
export function asUser<T>(claims: JwtClaims, fn: (tx: Tx) => Promise<T>, db: Db = getDb()): Promise<T> {
  return db.transaction(async (tx) => {
    await applyTimeouts(tx);
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}

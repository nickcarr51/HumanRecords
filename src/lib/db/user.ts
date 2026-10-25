import "server-only";
import { getDb, type Db, type Tx } from "./client";
import { doorSetup } from "./timeouts";
import type { JwtClaims } from "@/lib/services/viewer";

// Door 1: RLS on. Same identity PostgREST would use: the `authenticated` role
// plus the verified claims, so auth.uid(), current_user_role() and every policy
// apply. doorSetup sets it all in one transaction-local statement, so nothing
// outlives the transaction.
// `db` is injectable for the connection-leak test only.
export function asUser<T>(claims: JwtClaims, fn: (tx: Tx) => Promise<T>, db: Db = getDb()): Promise<T> {
  return db.transaction(async (tx) => {
    await doorSetup(tx, claims);
    return fn(tx);
  });
}

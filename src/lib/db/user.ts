import "server-only";
import { getDb, type Db, type Tx } from "./client";
import { prepareTransaction } from "./transaction-setup";
import type { JwtClaims } from "@/lib/services/viewer";

// Runs the query as the signed-in user, so the database's normal permission
// rules (RLS) apply. Same identity PostgREST would use: the `authenticated`
// role plus the verified user id (prepareTransaction sends only sub and role),
// so auth.uid(), current_user_role() and every policy apply.
// prepareTransaction sets it all in one transaction-local statement, so
// nothing outlives the transaction.
// `db` is injectable for the connection-reset tests only.
export function asUser<T>(claims: JwtClaims, fn: (tx: Tx) => Promise<T>, db: Db = getDb()): Promise<T> {
  return db.transaction(async (tx) => {
    await prepareTransaction(tx, claims);
    return fn(tx);
  });
}

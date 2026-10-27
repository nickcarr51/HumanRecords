import "server-only";
import { getDb, type Db, type Tx } from "./client";
import { prepareTransaction } from "./transaction-setup";
import { fromPgError } from "@/lib/services/errors";
import type { JwtClaims } from "@/lib/services/viewer";

// Runs the query as the signed-in user, so the database's normal permission
// rules (RLS) apply. Same identity PostgREST would use: the `authenticated`
// role plus the verified user id (prepareTransaction sends only sub and role),
// so auth.uid(), current_user_role() and every policy apply.
// prepareTransaction sets it all in one transaction-local statement, so
// nothing outlives the transaction.
// Any error from the setup or from `fn` goes through fromPgError, so a failed
// query never carries its SQL text to a user or a log.
// Tests may pass their own `db` to check the connection is left clean.
export async function asUser<T>(claims: JwtClaims, fn: (tx: Tx) => Promise<T>, db: Db = getDb()): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      await prepareTransaction(tx, claims);
      return fn(tx);
    });
  } catch (e) {
    throw fromPgError(e);
  }
}

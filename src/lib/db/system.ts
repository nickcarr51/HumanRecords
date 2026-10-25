import "server-only";
import { getDb, type Db, type Tx } from "./client";
import { prepareTransaction } from "./transaction-setup";
import { DomainError, fromPgError } from "@/lib/services/errors";
import { isIssuedGrant, type Action, type Grant } from "@/lib/services/policy";

// Runs with admin access (RLS bypassed), only after our code has confirmed
// permission with authorize(). It works like a SQL function that runs with
// its owner's rights: the check happens first, and the Grant from authorize()
// is the proof. The Grant must be for `action`, the job this call does.
// Lint allows imports of this module only inside src/lib/services and
// src/lib/db.
// Any error from the setup or from `fn` goes through fromPgError, so a failed
// query never carries its SQL text to a user or a log.
// Tests may pass their own `db`. It is chosen after the grant check (not as a
// default parameter), so a forged or mismatched grant fails before any
// database access.
export async function asSystem<T>(grant: Grant, action: Action, fn: (tx: Tx) => Promise<T>, db?: Db): Promise<T> {
  if (!isIssuedGrant(grant) || grant.action !== action) throw new DomainError("FORBIDDEN", "Not authorized.");
  try {
    return await (db ?? getDb()).transaction(async (tx) => {
      await prepareTransaction(tx);
      return fn(tx);
    });
  } catch (e) {
    throw fromPgError(e);
  }
}

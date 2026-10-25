import "server-only";
import { getDb, type Db, type Tx } from "./client";
import { prepareTransaction } from "./transaction-setup";
import { DomainError } from "@/lib/services/errors";
import { isIssuedGrant, type Grant } from "@/lib/services/policy";

// Runs with admin access (RLS bypassed), only after our code has confirmed
// permission with authorize(). The same trust model as a security definer
// function: the Grant from authorize() is the proof.
// Lint keeps imports of this module inside src/lib/services.
// `db` is injectable for the failed-transaction test only. It is resolved
// after the grant check (not as a default parameter), so a forged grant fails
// before any database access.
export async function asSystem<T>(grant: Grant, fn: (tx: Tx) => Promise<T>, db?: Db): Promise<T> {
  if (!isIssuedGrant(grant)) throw new DomainError("FORBIDDEN", "Not authorized.");
  return (db ?? getDb()).transaction(async (tx) => {
    await prepareTransaction(tx);
    return fn(tx);
  });
}

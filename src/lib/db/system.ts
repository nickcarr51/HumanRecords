import "server-only";
import { getDb, type Db, type Tx } from "./client";
import { doorSetup } from "./timeouts";
import { DomainError } from "@/lib/services/errors";
import { isIssuedGrant, type Grant } from "@/lib/services/policy";

// Door 2: RLS OFF. The same trust model as a security definer function: the
// caller already checked permission, proven by the Grant from authorize().
// Lint keeps imports of this module inside src/lib/services.
// `db` is injectable for the failed-transaction test only. It is resolved
// after the grant check (not as a default parameter), so a forged grant fails
// before any database access.
export async function asSystem<T>(grant: Grant, fn: (tx: Tx) => Promise<T>, db?: Db): Promise<T> {
  if (!isIssuedGrant(grant)) throw new DomainError("FORBIDDEN", "Not authorized.");
  return (db ?? getDb()).transaction(async (tx) => {
    await doorSetup(tx);
    return fn(tx);
  });
}

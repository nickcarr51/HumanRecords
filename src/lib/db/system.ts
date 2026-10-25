import "server-only";
import { getDb, type Tx } from "./client";
import { doorSetup } from "./timeouts";
import { DomainError } from "@/lib/services/errors";
import { isIssuedGrant, type Grant } from "@/lib/services/policy";

// Door 2: RLS OFF. The same trust model as a security definer function: the
// caller already checked permission, proven by the Grant from authorize().
// Lint keeps imports of this module inside src/lib/services.
export async function asSystem<T>(grant: Grant, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!isIssuedGrant(grant)) throw new DomainError("FORBIDDEN", "Not authorized.");
  return getDb().transaction(async (tx) => {
    await doorSetup(tx);
    return fn(tx);
  });
}

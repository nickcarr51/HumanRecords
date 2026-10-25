import "server-only";
import { getDb, type Tx } from "./client";
import { applyTimeouts } from "./timeouts";
import type { Grant } from "@/lib/services/policy";

// Door 2: RLS OFF. The same trust model as a security definer function: the
// caller already checked permission, proven by the Grant from authorize().
// Lint keeps imports of this module inside src/lib/services.
export function asSystem<T>(grant: Grant, fn: (tx: Tx) => Promise<T>): Promise<T> {
  void grant;
  return getDb().transaction(async (tx) => {
    await applyTimeouts(tx);
    return fn(tx);
  });
}

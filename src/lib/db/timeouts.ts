import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "./client";

// Today every read goes through PostgREST, which applies the `authenticated`
// role's statement_timeout (8s) and the authenticator's lock_timeout (8s).
// A direct Drizzle connection has neither, so both doors set them per
// transaction. 10s is the owner's choice (2026-10-24).
export const QUERY_TIMEOUT = "10s";

export async function applyTimeouts(tx: Tx): Promise<void> {
  await tx.execute(sql.raw(`set local statement_timeout = '${QUERY_TIMEOUT}'`));
  await tx.execute(sql.raw(`set local lock_timeout = '${QUERY_TIMEOUT}'`));
}

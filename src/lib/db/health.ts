import "server-only";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "./client";
import { prepareTransaction } from "./transaction-setup";

// The checks, in the order they run. Each one names something the app relies
// on:
// - query: a query runs at all (DATABASE_URL is set and valid, TLS works)
// - bypassesRls: the login role skips RLS, which asSystem relies on
// - readsAuthUsers: the login role can read auth.users (listUsers does)
// - switchesToAuthenticated: the login role can switch to `authenticated`,
//   which asUser does for every signed-in query
export type DatabaseCheck = "query" | "bypassesRls" | "readsAuthUsers" | "switchesToAuthenticated";

export type DatabaseHealth = { ok: true } | { ok: false; failed: DatabaseCheck };

class CheckFailed extends Error {}

// Runs every check in one read-only transaction, with the usual 10s timeouts
// (prepareTransaction without claims). Read-only because the route that calls
// this is public: the database itself refuses any write in this transaction. Reads no user data: the auth.users
// check only asks whether the table can be read. Stops at the first failure
// and says which check it was; the error itself is not returned.
// Tests may pass their own `db`.
export async function checkDatabase(db?: Db): Promise<DatabaseHealth> {
  let current: DatabaseCheck = "query";
  try {
    await (db ?? getDb()).transaction(
      async (tx) => {
        await prepareTransaction(tx);
        await tx.execute(sql`select 1`);

        current = "bypassesRls";
        const [role] = await tx.execute<{ bypass: boolean }>(
          sql`select rolbypassrls as bypass from pg_roles where rolname = current_user`,
        );
        if (role?.bypass !== true) throw new CheckFailed();

        current = "readsAuthUsers";
        await tx.execute(sql`select exists(select 1 from auth.users limit 1) as readable`);

        current = "switchesToAuthenticated";
        await tx.execute(sql`set local role authenticated`);
        await tx.execute(sql`select 1`);
      },
      { accessMode: "read only" },
    );
    return { ok: true };
  } catch {
    return { ok: false, failed: current };
  }
}

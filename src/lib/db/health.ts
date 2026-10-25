import "server-only";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "./client";
import { isPostgresError } from "@/lib/services/errors";
import { prepareTransaction } from "./transaction-setup";

// The checks, in the order they run. Each one names something the app relies
// on:
// - query: a query runs at all (DATABASE_URL is set and valid, TLS works)
// - bypassesRls: the login role skips RLS, which asSystem relies on
// - readsAuthUsers: the login role can read auth.users (listUsers does)
// - switchesToAuthenticated: the login role can switch to `authenticated`,
//   which asUser does for every signed-in query
export type DatabaseCheck = "query" | "bypassesRls" | "readsAuthUsers" | "switchesToAuthenticated";

// On failure, `error` names what went wrong by the error's name and code only
// (e.g. "PostgresError 28P01" for a wrong password, "Error ECONNREFUSED" when
// nothing answers), never its message, which can hold the query text or the
// database address.
export type DatabaseHealth = { ok: true } | { ok: false; failed: DatabaseCheck; error: string };

class CheckFailed extends Error {
  name = "CheckFailed";
}

// Only plain names and codes are reported: anything else becomes "unknown".
const SAFE_NAME = /^[A-Za-z]{1,64}$/;
const SAFE_CODE = /^[A-Z0-9_]{1,64}$/;

// Drizzle wraps a failed query in an error named just "Error" and keeps the
// database's own error in `cause`, so the cause is described when there is one.
// The database's own errors are always called "PostgresError": the production
// build renames postgres.js's class, so its real name there is a made-up one.
function describeError(e: unknown): string {
  const cause: unknown = typeof e === "object" && e !== null ? Reflect.get(e, "cause") : undefined;
  const source: unknown = typeof cause === "object" && cause !== null ? cause : e;
  if (typeof source !== "object" || source === null) return "unknown";
  const name: unknown = isPostgresError(source) ? "PostgresError" : Reflect.get(source, "name");
  const code: unknown = Reflect.get(source, "code");
  const safeName = typeof name === "string" && SAFE_NAME.test(name) ? name : "unknown";
  return typeof code === "string" && SAFE_CODE.test(code) ? `${safeName} ${code}` : safeName;
}

// Runs every check in one read-only transaction, with the usual 10s timeouts
// (prepareTransaction without claims). Read-only because the route that calls
// this is public: the database itself refuses any write in this transaction.
// Reads no user data: the auth.users check only asks whether the table can be
// read. Stops at the first failure and says which check it was, plus the
// error's name and code (describeError).
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
  } catch (e) {
    return { ok: false, failed: current, error: describeError(e) };
  }
}

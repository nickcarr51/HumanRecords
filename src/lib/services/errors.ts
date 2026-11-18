import "server-only";
import { DrizzleQueryError } from "drizzle-orm";

export type DomainErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID" | "NOT_FOUND" | "RETRY" | "CONFLICT";

// The error type services throw for a known problem. Its message is always
// written by us, never the database's own text, so it is safe to show a user.
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

// Any other database failure. It carries only a fixed message, Postgres's
// five-character error code when there is one (e.g. 57014 for a query that
// ran too long; none when the connection dropped) and the values that were
// sent with the query. Never the query text, and no `cause` (the original
// error's message holds the full query).
export class DatabaseError extends Error {
  constructor(
    readonly code: string | undefined,
    readonly params: unknown[] | undefined,
  ) {
    super("Database query failed");
    this.name = "DatabaseError";
  }
}

// Postgres error codes with a plain meaning: the three our SQL functions raise
// (42501 no permission, 22023 bad input, P0002 not found) plus Postgres's own
// deadlock (40P01) and "another row still points at this one" (23503) errors.
// Each gets a fixed message.
const BY_PG_CODE: Record<string, { code: DomainErrorCode; message: string }> = {
  "42501": { code: "FORBIDDEN", message: "You don't have permission to do that." },
  "22023": { code: "INVALID", message: "That request isn't valid." },
  P0002: { code: "NOT_FOUND", message: "That item doesn't exist." },
  "40P01": { code: "RETRY", message: "The database was busy; please try again." },
  "23503": { code: "CONFLICT", message: "That item is still in use." },
};

// Postgres error codes are five digits or capital letters.
const PG_CODE = /^[0-9A-Z]{5}$/;

// True for an error the database itself sent back. postgres.js copies every
// field of the database's report onto its PostgresError, and Postgres always
// sends a severity (its "S" field, which postgres.js calls severity_local). A
// Node system error whose code also happens to be five capital letters
// (EPIPE, EPERM) has no severity, so it doesn't count. Matched by that field,
// not by the class or its name: the production build renames the class (its
// `name` there is a short made-up one, e.g. "o").
export function isPostgresError(value: unknown): boolean {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "severity_local") === "string";
}

// The code of an error the database itself sent back.
function pgCodeOf(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !isPostgresError(value)) return undefined;
  const code: unknown = Reflect.get(value, "code");
  return typeof code === "string" && PG_CODE.test(code) ? code : undefined;
}

// Drizzle wraps every failed query in a DrizzleQueryError, whose message is
// the full SQL text plus its values; it keeps the text in `query`, the values
// in `params` and the postgres.js error in `cause`. Matched by class, or by
// that shape in case two copies of drizzle-orm are loaded.
function isDrizzleQueryError(e: unknown): e is { query: string; params: unknown; cause?: unknown } {
  if (e instanceof DrizzleQueryError) return true;
  return typeof e === "object" && e !== null && typeof Reflect.get(e, "query") === "string" && "params" in e;
}

// The one place that turns a database error into a safe error. asUser and
// asSystem pass every error through it.
// - A DomainError comes back unchanged.
// - A database error becomes a DomainError with a fixed message when its
//   Postgres error code has a plain meaning, and a DatabaseError otherwise.
//   A database error is one the database itself sent back (isPostgresError:
//   the error itself, or its `cause`), or any Drizzle query error, even one
//   with no code (e.g. the connection dropped mid-query), because its message
//   holds the SQL text.
// - Anything else (not from the database, no Drizzle query attached) comes
//   back unchanged.
export function fromPgError(e: unknown): unknown {
  if (e instanceof DomainError) return e;
  const drizzle = isDrizzleQueryError(e);
  const cause = typeof e === "object" && e !== null ? Reflect.get(e, "cause") : undefined;
  const pgCode = pgCodeOf(e) ?? pgCodeOf(cause);
  if (!pgCode && !drizzle) return e;
  const known = pgCode ? BY_PG_CODE[pgCode] : undefined;
  if (known) return new DomainError(known.code, known.message);
  const params = drizzle ? (e as { params: unknown }).params : undefined;
  return new DatabaseError(pgCode, Array.isArray(params) ? params : undefined);
}

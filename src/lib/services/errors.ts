export type DomainErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID" | "NOT_FOUND" | "RETRY" | "CONFLICT";

// The one error type services throw. Messages are safe to show a user.
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

// The SQLSTATEs callers map today: the three the SQL functions raise (42501,
// 22023, P0002) plus Postgres's own deadlock (40P01) and foreign-key (23503)
// errors, so callers map errors the same way whichever path produced them.
const BY_SQLSTATE: Record<string, DomainErrorCode> = {
  "42501": "FORBIDDEN",
  "22023": "INVALID",
  P0002: "NOT_FOUND",
  "40P01": "RETRY",
  "23503": "CONFLICT",
};

export function fromPgError(e: unknown): unknown {
  const err = e as { code?: unknown; cause?: { code?: unknown }; message?: string } | null;
  const sqlstate = err?.code ?? err?.cause?.code;
  const code = typeof sqlstate === "string" ? BY_SQLSTATE[sqlstate] : undefined;
  return code ? new DomainError(code, err?.message ?? code) : e;
}

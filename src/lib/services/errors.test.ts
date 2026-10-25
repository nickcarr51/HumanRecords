import { describe, expect, it } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError, DomainError, fromPgError } from "./errors";

// True when `text` appears anywhere inside `value`: in any own property,
// hidden or not, at any depth (cause included).
function containsText(value: unknown, text: string, seen = new Set<unknown>()): boolean {
  if (typeof value === "string") return value.includes(text);
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);
  return Object.getOwnPropertyNames(value).some((key) => containsText(Reflect.get(value, key), text, seen));
}

// A stand-in for Drizzle's query error: its message is the query text, and
// the postgres.js error (with the Postgres error code) is its cause.
function drizzleStyleError(pgCode: string) {
  const pg = Object.assign(new Error("permission denied for table secret_stuff"), { code: pgCode });
  return Object.assign(new Error("Failed query: select * from secret_stuff where id = $1\nparams: abc"), {
    query: "select * from secret_stuff where id = $1",
    params: ["abc"],
    cause: pg,
  });
}

describe("fromPgError", () => {
  it.each([
    ["42501", "FORBIDDEN", "You don't have permission to do that."],
    ["22023", "INVALID", "That request isn't valid."],
    ["P0002", "NOT_FOUND", "That item doesn't exist."],
    ["40P01", "RETRY", "The database was busy; please try again."],
    ["23503", "CONFLICT", "That item is still in use."],
  ])("turns Postgres error code %s into %s with a fixed message", (pgCode, code, message) => {
    const mapped = fromPgError(Object.assign(new Error("the database's own words"), { code: pgCode }));
    expect(mapped).toBeInstanceOf(DomainError);
    expect(mapped).toMatchObject({ code, message });
  });

  it("reads the Postgres error code from the cause (how Drizzle wraps errors), and drops the query text", () => {
    const mapped = fromPgError(drizzleStyleError("42501"));
    expect(mapped).toBeInstanceOf(DomainError);
    expect(mapped).toMatchObject({ code: "FORBIDDEN", message: "You don't have permission to do that." });
    expect(JSON.stringify(mapped)).not.toContain("secret_stuff");
    expect((mapped as Error).cause).toBeUndefined();
  });

  it("passes a DomainError through unchanged", () => {
    const e = new DomainError("UNAUTHENTICATED", "Sign in to continue.");
    expect(fromPgError(e)).toBe(e);
  });

  it("turns any other database error into a DatabaseError with the code and values, and no query text", () => {
    const mapped = fromPgError(drizzleStyleError("57014"));
    expect(mapped).toBeInstanceOf(DatabaseError);
    const err = mapped as DatabaseError;
    expect(err.name).toBe("DatabaseError");
    expect(err.message).toBe("Database query failed");
    expect(err.code).toBe("57014");
    expect(err.params).toEqual(["abc"]);
    expect(err.cause).toBeUndefined();
    for (const key of Object.getOwnPropertyNames(err)) {
      expect(String(Reflect.get(err, key))).not.toContain("secret_stuff");
    }
  });

  it("gives a DatabaseError with no values when the error carried none", () => {
    const mapped = fromPgError(Object.assign(new Error("server closed"), { code: "XX000" }));
    expect(mapped).toMatchObject({ name: "DatabaseError", code: "XX000", params: undefined });
  });

  it.each([
    ["a cause with no code", new Error("write CONNECTION_CLOSED secret_stuff")],
    ["no cause at all", undefined],
  ])("turns a Drizzle query error with %s (e.g. a dropped connection) into a DatabaseError with no SQL text", (_label, cause) => {
    const e = new DrizzleQueryError("select * from secret_stuff where id = $1", ["abc"], cause);
    const mapped = fromPgError(e);
    expect(mapped).toBeInstanceOf(DatabaseError);
    expect(mapped).toMatchObject({ name: "DatabaseError", message: "Database query failed", code: undefined, params: ["abc"] });
    expect((mapped as Error).cause).toBeUndefined();
    expect(containsText(mapped, "secret_stuff")).toBe(false);
    expect(containsText(mapped, "select *")).toBe(false);
  });

  it("recognises a Drizzle query error by its shape too (query text and params)", () => {
    const e = Object.assign(new Error("Failed query: select * from secret_stuff\nparams: "), {
      query: "select * from secret_stuff",
      params: [],
    });
    const mapped = fromPgError(e);
    expect(mapped).toMatchObject({ name: "DatabaseError", message: "Database query failed", code: undefined });
    expect(containsText(mapped, "secret_stuff")).toBe(false);
  });

  it.each([
    ["a plain Error", new Error("boom")],
    ["an Error whose code isn't a Postgres error code", Object.assign(new Error("refused"), { code: "ECONNREFUSED" })],
    ["a string", "boom"],
    ["null", null],
  ])("passes %s through unchanged", (_label, e) => {
    expect(fromPgError(e)).toBe(e);
  });
});

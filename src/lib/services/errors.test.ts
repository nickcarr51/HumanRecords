import { describe, expect, it } from "vitest";
import { DomainError, fromPgError } from "./errors";

describe("fromPgError", () => {
  it.each([
    ["42501", "FORBIDDEN"],
    ["22023", "INVALID"],
    ["P0002", "NOT_FOUND"],
    ["40P01", "RETRY"],
    ["23503", "CONFLICT"],
  ])("maps SQLSTATE %s to %s", (sqlstate, code) => {
    const mapped = fromPgError(Object.assign(new Error("boom"), { code: sqlstate }));
    expect(mapped).toBeInstanceOf(DomainError);
    expect((mapped as DomainError).code).toBe(code);
  });

  it("reads the SQLSTATE from a wrapped cause (Drizzle query errors)", () => {
    const wrapped = Object.assign(new Error("query failed"), { cause: { code: "42501" } });
    expect((fromPgError(wrapped) as DomainError).code).toBe("FORBIDDEN");
  });

  it("passes unknown errors through untouched", () => {
    const e = Object.assign(new Error("x"), { code: "XX000" });
    expect(fromPgError(e)).toBe(e);
  });
});

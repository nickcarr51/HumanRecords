import { describe, expect, it } from "vitest";
import { parseUsersFile } from "./users-file.mts";

describe("parseUsersFile", () => {
  it("returns normalized users", () => {
    expect(
      parseUsersFile([{ email: " A@B.co ", role: "label_member", name: " Ann " }]),
    ).toEqual([{ email: "a@b.co", role: "label_member", name: "Ann" }]);
  });

  it("rejects a non-array", () => {
    expect(() => parseUsersFile({})).toThrow(/array/);
  });

  it("rejects an unknown role", () => {
    expect(() => parseUsersFile([{ email: "a@b.co", role: "admin", name: "A" }])).toThrow(/role/);
  });

  it("rejects a missing email", () => {
    expect(() => parseUsersFile([{ role: "listener", name: "A" }])).toThrow(/email/);
  });
});

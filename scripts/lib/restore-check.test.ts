import { describe, expect, it } from "vitest";
import { checkRestoreCounts, latestBackupStamp, parseCountsRow } from "./restore-check.mts";

describe("latestBackupStamp", () => {
  it("picks the newest PRE line from aws s3 ls", () => {
    const ls = "                           PRE 20261004T090000Z/\n                           PRE 20261006T090000Z/\n                           PRE 20261005T090000Z/\n";
    expect(latestBackupStamp(ls)).toBe("20261006T090000Z");
  });
  it("throws when there are no backups", () => {
    expect(() => latestBackupStamp("")).toThrow(/no backups/);
  });
  it("ignores lines that are not stamps", () => {
    expect(latestBackupStamp("PRE junk/\nPRE 20261004T090000Z/\n")).toBe("20261004T090000Z");
  });
});

describe("parseCountsRow", () => {
  it("parses psql -tA -F, output", () => {
    expect(parseCountsRow("3,3,12,5\n")).toEqual({ authUsers: 3, users: 3, tracks: 12, releases: 5 });
  });
  it("throws on garbage", () => {
    expect(() => parseCountsRow("ERROR")).toThrow(/counts/);
  });
});

describe("checkRestoreCounts", () => {
  it("passes a healthy restore", () => {
    expect(checkRestoreCounts({ authUsers: 2, users: 2, tracks: 0, releases: 0 })).toEqual([]);
  });
  it("fails when the backup has no accounts (auth schema missing from dump)", () => {
    expect(checkRestoreCounts({ authUsers: 0, users: 0, tracks: 4, releases: 2 })[0]).toMatch(/no accounts/);
  });
  it("fails when public.users and auth.users disagree", () => {
    expect(checkRestoreCounts({ authUsers: 3, users: 2, tracks: 0, releases: 0 })[0]).toMatch(/mismatch/);
  });
});

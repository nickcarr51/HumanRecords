import { describe, expect, it } from "vitest";
import { checkMigrationChanges, findIncludeSeed, parseMigrationList } from "./migration-rules.mts";

const M = "supabase/migrations/";
const base = [`${M}20260915004137_create_users.sql`, `${M}20261002120100_create_invites.sql`];

describe("checkMigrationChanges", () => {
  it("accepts a new, later migration", () => {
    expect(checkMigrationChanges(base, [{ status: "A", path: `${M}20261004120000_add_x.sql` }])).toEqual([]);
  });

  it("ignores files outside supabase/migrations", () => {
    expect(checkMigrationChanges(base, [{ status: "M", path: "src/app/page.tsx" }])).toEqual([]);
  });

  it("flags an edited migration", () => {
    const errors = checkMigrationChanges(base, [{ status: "M", path: base[0] }]);
    expect(errors[0]).toMatch(/already-merged migration/);
  });

  it("flags a deleted migration", () => {
    expect(checkMigrationChanges(base, [{ status: "D", path: base[1] }])[0]).toMatch(/already-merged migration/);
  });

  it("flags a rename as delete + add", () => {
    const errors = checkMigrationChanges(base, [
      { status: "D", path: base[1] },
      { status: "A", path: `${M}20261005000000_create_invites.sql` },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/already-merged migration/);
  });

  it("flags a new migration dated before the newest merged one", () => {
    expect(
      checkMigrationChanges(base, [{ status: "A", path: `${M}20261001000000_backdated.sql` }])[0],
    ).toMatch(/must be later than 20261002120100/);
  });

  it("flags a badly named migration", () => {
    expect(checkMigrationChanges(base, [{ status: "A", path: `${M}add-thing.sql` }])[0]).toMatch(/name/);
  });
});

describe("findIncludeSeed", () => {
  it("flags --include-seed in a workflow", () => {
    expect(
      findIncludeSeed([{ path: ".github/workflows/deploy.yml", content: "supabase db push --include-seed" }]),
    ).toHaveLength(1);
  });

  it("passes clean workflows", () => {
    expect(findIncludeSeed([{ path: ".github/workflows/deploy.yml", content: "supabase db push" }])).toEqual([]);
  });
});

describe("parseMigrationList", () => {
  it("returns [] when the base has no migrations dir (empty ls-tree output)", () => {
    expect(parseMigrationList("")).toEqual([]);
    expect(parseMigrationList("\n")).toEqual([]);
  });

  it("keeps full .sql paths under supabase/migrations/", () => {
    const out = `${M}20260915004137_create_users.sql\n${M}.gitkeep\nsupabase/config.toml\n`;
    expect(parseMigrationList(out)).toEqual([`${M}20260915004137_create_users.sql`]);
  });
});

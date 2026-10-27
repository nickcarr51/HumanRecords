import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeSchema } from "./drizzle-schema.mts";

const head = (names: string) => [
  `import { ${names} } from "drizzle-orm/pg-core"`,
  'import { sql } from "drizzle-orm"',
  "",
];
const enums = (...names: string[]) =>
  names.map((n) => `export const ${n} = pgEnum("${n}", ['a'])`).concat("", "");

// The same two tables as a long-lived local database and CI's fresh one gave
// them (2026-10-26): different table, entry, key-column and policy order, and
// drizzle-kit kept `using` / `withCheck` only on whichever policy came first.
const artists = (policies: string[], fkFirst: boolean) => {
  const fk = [
    "\tforeignKey({",
    "\t\t\tcolumns: [table.userId],",
    "\t\t\tforeignColumns: [users.id],",
    '\t\t\tname: "artists_user_id_fkey"',
    '\t\t}).onDelete("set null"),',
  ];
  const unique = ['\tunique("artists_user_id_key").on(table.userId),'];
  return [
    'export const artists = pgTable("artists", {',
    "\tid: uuid().primaryKey().notNull(),",
    '\tuserId: uuid("user_id"),',
    "}, (table) => [",
    ...(fkFirst ? [...fk, ...unique] : [...unique, ...fk]),
    ...policies,
    "]);",
  ];
};
const read = (using: string) =>
  `\tpgPolicy("authenticated users can read artists", { as: "permissive", for: "select", to: ["authenticated"]${using} }),`;
const update = (using: string) =>
  `\tpgPolicy("label members update artists", { as: "permissive", for: "update", to: ["authenticated"]${using}  }),`;
const downloads = (columns: string) => [
  'export const downloads = pgTable("downloads", {',
  '\tuserId: uuid("user_id").notNull(),',
  '\ttrackId: uuid("track_id").notNull(),',
  "}, (table) => [",
  `\tprimaryKey({ columns: [${columns}], name: "downloads_pkey"}),`,
  "]);",
];
const plain = ['export const zebra = pgTable("zebra", {', "\tid: uuid().primaryKey(),", "});"];

const local = [
  ...head("pgTable, uuid, foreignKey, unique, pgPolicy, primaryKey, pgEnum"),
  ...enums("userRole", "releaseKind"),
  ...artists([read(", using: sql`true`"), update("")], true),
  "",
  ...downloads("table.userId, table.trackId"),
  "",
  ...plain,
  "",
].join("\n");
const ci = [
  ...head("pgTable, foreignKey, unique, pgPolicy, uuid, primaryKey, pgEnum"),
  ...enums("releaseKind", "userRole"),
  ...plain,
  "",
  ...downloads("table.trackId, table.userId"),
  "",
  ...artists(
    [update(", using: sql`(current_user_role() = 'label_member'::user_role)`, withCheck: sql`(length(name) > 0)`"), read("")],
    false,
  ),
  "",
].join("\n");

const expected = [
  ...head("foreignKey, pgEnum, pgPolicy, pgTable, primaryKey, unique, uuid"),
  ...enums("releaseKind", "userRole"),
  'export const artists = pgTable("artists", {',
  "\tid: uuid().primaryKey().notNull(),",
  '\tuserId: uuid("user_id"),',
  "}, (table) => [",
  "\tforeignKey({",
  "\t\t\tcolumns: [table.userId],",
  "\t\t\tforeignColumns: [users.id],",
  '\t\t\tname: "artists_user_id_fkey"',
  '\t\t}).onDelete("set null"),',
  '\tpgPolicy("authenticated users can read artists", { as: "permissive", for: "select", to: ["authenticated"] }),',
  '\tpgPolicy("label members update artists", { as: "permissive", for: "update", to: ["authenticated"] }),',
  '\tunique("artists_user_id_key").on(table.userId),',
  "]);",
  "",
  ...downloads("table.trackId, table.userId"),
  "",
  ...plain,
  "",
].join("\n");

describe("normalizeSchema", () => {
  it("gives the same file for both databases' pulls", () => {
    expect(normalizeSchema(local)).toBe(expected);
    expect(normalizeSchema(ci)).toBe(expected);
  });

  it("changes nothing on a second run", () => {
    expect(normalizeSchema(expected)).toBe(expected);
  });

  it("matches the committed schema (yarn db:pull ran it)", () => {
    const committed = readFileSync("src/lib/db/generated/schema.ts", "utf8");
    expect(normalizeSchema(committed)).toBe(committed);
    expect(committed).not.toMatch(/pgPolicy\([^\n]*sql`/);
  });

  it("throws on a shape it doesn't know", () => {
    expect(() => normalizeSchema(local.replace("export const zebra", "export const zebra2 = pgView(\nexport const zebra"))).toThrow(
      /unexpected top-level line/,
    );
    expect(() => normalizeSchema(local.replace("\tid: uuid().primaryKey(),\n});", "\tid: uuid().primaryKey(),\n}));"))).toThrow(
      /unexpected table end/,
    );
    expect(() => normalizeSchema(local.replace(", using: sql`true`", ", using: sql`a`, other: sql`b`"))).toThrow(
      /policy expression left in/,
    );
    expect(() => normalizeSchema(local.replace('import { sql } from "drizzle-orm"', ""))).toThrow(
      /unexpected second line/,
    );
  });
});

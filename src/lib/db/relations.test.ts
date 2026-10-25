import { describe, expect, it } from "vitest";
import { getTableName, is, type Column } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  normalizeRelation,
  One,
  Relations,
} from "drizzle-orm/relations";
import * as schema from "./generated/schema";
import * as relations from "./relations";

// relations.ts is written by hand. Every link it declares must match a
// foreign key the database really has, as pulled into generated/schema.ts:
// same tables, same columns.

const { tables, tableNamesMap } = extractTablesRelationalConfig(
  { ...schema, ...relations },
  createTableRelationsHelpers,
);

// Compared by table and column name: Drizzle hands the foreign key its own
// copies of the column objects.
const columnId = (c: Column) => `${getTableName(c.table)}.${c.name}`;
const sameColumns = (a: Column[], b: Column[]) =>
  a.length === b.length && a.every((c, i) => columnId(c) === columnId(b[i]));

function hasForeignKey(from: PgTable, columns: Column[], to: Column[]): boolean {
  return getTableConfig(from).foreignKeys.some((fk) => {
    const ref = fk.reference();
    return sameColumns(ref.columns, columns) && sameColumns(ref.foreignColumns, to);
  });
}

const label = (cols: Column[]) => cols.map(columnId).join(", ");

// Every link declared in relations.ts, as [description, table with the foreign
// key, its columns, the columns they point at].
const links = (Object.values(relations) as unknown[])
  .filter((r): r is Relations => is(r, Relations))
  .flatMap((r) =>
    Object.entries(r.config(createTableRelationsHelpers(r.table))).map(([name, relation]) => {
      const source = getTableName(r.table);
      if (is(relation, One) && relation.config) {
        // The link's own table holds the foreign key.
        const { fields, references } = relation.config;
        return [`${source}.${name}`, r.table as PgTable, fields as Column[], references as Column[]] as const;
      }
      // A one-to-many link: Drizzle resolves it from the other table's link
      // back here, and the other table holds the foreign key.
      const { fields, references } = normalizeRelation(tables, tableNamesMap, relation);
      return [`${source}.${name}`, relation.referencedTable as PgTable, references as Column[], fields as Column[]] as const;
    }),
  );

describe("relations.ts", () => {
  it("declares links to check", () => {
    expect(links.length).toBeGreaterThan(0);
  });

  it.each(links)("%s matches a real foreign key", (_name, table, columns, pointsAt) => {
    expect(
      hasForeignKey(table, columns, pointsAt),
      `no foreign key on ${getTableName(table)} from (${label(columns)}) to (${label(pointsAt)})`,
    ).toBe(true);
  });
});

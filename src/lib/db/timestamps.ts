import { sql, type AnyColumn, type SQL } from "drizzle-orm";

// PostgREST serializes timestamptz through to_json (2026-10-23T12:00:00.123456+00:00).
// Selecting the same way keeps every timestamp string byte-identical to what
// supabase-js returned before. The result type follows the column: string for
// a NOT NULL column, string | null for a nullable one (null stays null).
// Warning: a NOT NULL column read through a left join can still be missing
// (null when there is no matching row), but its type here says string. Use
// the nullable form there: `pgrstTs(col) as SQL<string | null>`.
export function pgrstTs<C extends AnyColumn>(col: C): SQL<C["_"]["notNull"] extends true ? string : string | null> {
  return sql`to_json(${col}) #>> '{}'`;
}

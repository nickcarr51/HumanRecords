import { sql, type AnyColumn, type SQL } from "drizzle-orm";

// PostgREST serializes timestamptz through to_json (2026-10-23T12:00:00.123456+00:00).
// Selecting the same way keeps every timestamp string byte-identical to what
// supabase-js returned before. The result type follows the column: string for
// a NOT NULL column, string | null for a nullable one (null stays null).
export function pgrstTs<C extends AnyColumn>(col: C): SQL<C["_"]["notNull"] extends true ? string : string | null> {
  return sql`to_json(${col}) #>> '{}'`;
}

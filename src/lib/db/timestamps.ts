import { sql, type AnyColumn } from "drizzle-orm";

// PostgREST serializes timestamptz through to_json (2026-10-23T12:00:00.123456+00:00).
// Selecting the same way keeps every timestamp string byte-identical to what
// supabase-js returned before. null stays null.
export function pgrstTs(col: AnyColumn) {
  return sql<string | null>`to_json(${col}) #>> '{}'`;
}

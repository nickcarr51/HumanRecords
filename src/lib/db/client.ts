import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./generated/schema";
import * as relations from "./relations";
import { authUsers } from "./auth-schema";

const fullSchema = { ...schema, ...relations, authUsers };

export type Db = PostgresJsDatabase<typeof fullSchema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let db: Db | undefined;

// Lazy: the build and every page that doesn't use the database work without
// DATABASE_URL. prepare:false is required by Supavisor's transaction pooler.
export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  db = drizzle(postgres(url, { prepare: false, max: 5 }), { schema: fullSchema });
  return db;
}

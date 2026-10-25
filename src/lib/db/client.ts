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

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

// The postgres.js options for a DATABASE_URL. Pure, so it is unit-tested.
export function connectionOptions(url: string) {
  const ssl: false | "require" = LOCAL_HOSTS.has(new URL(url).hostname) ? false : "require";
  return {
    // Required by Supavisor's transaction mode, which can't keep prepared
    // statements across pooled connections.
    prepare: false,
    max: 5,
    // Serverless: release idle connections after 20s, and fail fast (10s)
    // instead of hanging a request when the pooler can't be reached.
    idle_timeout: 20,
    connect_timeout: 10,
    // TLS so user data and verified claims never cross the network in
    // plaintext. postgres.js defaults to ssl:false; the local stack has no TLS.
    ssl,
  };
}

// Lazy: the build and every page that doesn't use the database work without
// DATABASE_URL.
export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  db = drizzle(postgres(url, connectionOptions(url)), { schema: fullSchema });
  return db;
}

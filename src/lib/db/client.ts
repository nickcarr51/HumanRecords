import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./generated/schema";
import * as relations from "./relations";
import { authUsers } from "./auth-schema";
import { SUPABASE_ROOT_CA_2021 } from "./supabase-ca";

const fullSchema = { ...schema, ...relations, authUsers };

export type Db = PostgresJsDatabase<typeof fullSchema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let db: Db | undefined;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

// Parsed here to choose TLS; a bad URL is reported without echoing it. Node's
// URL error carries the whole input (password included) in its `input`
// property, so it is replaced, with no cause and no URL text.
function parseUrl(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
}

// The postgres.js options for a DATABASE_URL. It opens no connection, so the
// unit tests call it directly.
export function connectionOptions(url: string) {
  const ssl = LOCAL_HOSTS.has(parseUrl(url).hostname)
    ? false
    : { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true };
  return {
    // Supabase's shared connection pool (port 6543) may run each transaction
    // on a different server connection, so postgres.js must not save a query
    // on one connection to reuse it later.
    prepare: false,
    max: 5,
    // Vercel runs the app as short-lived functions: release idle connections
    // after 20s, and fail fast (10s) instead of hanging a request when the
    // connection pool can't be reached.
    idle_timeout: 20,
    connect_timeout: 10,
    // Verified TLS for hosted databases: the connection is encrypted AND the
    // server certificate and hostname are checked against the embedded
    // Supabase Root 2021 CA, so user data and claims never cross the network
    // in plaintext or to an impostor. postgres.js defaults to ssl:false; the
    // local stack has no TLS.
    ssl,
  };
}

// A Drizzle instance with the app's full schema over a postgres.js client.
// getDb uses it; tests use it to wrap a single dedicated connection.
export function createDb(client: postgres.Sql): Db {
  return drizzle(client, { schema: fullSchema });
}

// Created on the first call, not when the module loads, so the build and
// every page that doesn't use the database work without DATABASE_URL.
export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  db = createDb(postgres(url, connectionOptions(url)));
  return db;
}

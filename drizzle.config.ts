import { defineConfig } from "drizzle-kit";

// Local Supabase only. The hosted databases are never introspected or
// migrated by Drizzle: Supabase migrations are the schema's source of truth,
// and the local stack is built from them. Do NOT read DATABASE_URL here.
export default defineConfig({
  dialect: "postgresql",
  out: ".drizzle-pull",
  schemaFilter: ["public"],
  entities: { roles: { provider: "supabase" } },
  dbCredentials: { url: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" },
});

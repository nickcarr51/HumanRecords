// @vitest-environment node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const hook = fileURLToPath(new URL("./guard-db.sh", import.meta.url));
const decide = (command: string) =>
  execFileSync("bash", [hook], { input: JSON.stringify({ tool_input: { command } }), encoding: "utf8" });

describe("guard-db.sh: drizzle-kit", () => {
  it.each([
    "yarn drizzle-kit push",
    "npx drizzle-kit migrate",
    "yarn drizzle-kit drop",
    "yarn drizzle-kit up",
    "yarn drizzle-kit pull --url postgresql://u:p@db.abc.supabase.co:5432/postgres",
    "yarn drizzle-kit pull --url postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
  ])("asks before: %s", (cmd) => {
    expect(decide(cmd)).toContain('"ask"');
  });

  it.each(["yarn db:pull", "yarn drizzle-kit pull"])("allows local: %s", (cmd) => {
    expect(decide(cmd)).toBe("");
  });

  it("says push/migrate change a database and drop/up rewrite migration files", () => {
    expect(decide("yarn drizzle-kit drop")).toContain(
      "drizzle-kit push/migrate change a database; drop/up rewrite Drizzle migration files.",
    );
  });
});

describe("guard-db.sh: hosted database URLs in any command", () => {
  it.each([
    "DATABASE_URL=postgresql://postgres.abc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres yarn dev",
    "DATABASE_URL=postgres://postgres:pw@db.abc.supabase.co:5432/postgres yarn test",
    "DATABASE_URL='postgresql://u:p@db.abc.supabase.com:5432/postgres' yarn build",
    `node -e "require('postgres')('postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres')"`,
    "export DATABASE_URL=POSTGRESQL://U:P@DB.ABC.SUPABASE.CO:5432/POSTGRES",
    // Passwords that aren't percent-encoded: a raw `@` or `/`, a space or a quote mark.
    "DATABASE_URL=postgresql://postgres.abc:p@ss@aws-0-us-east-1.pooler.supabase.com:6543/postgres yarn dev",
    "DATABASE_URL=postgresql://postgres:a/b@db.abc.supabase.co:5432/postgres yarn test",
    "DATABASE_URL=postgresql://postgres:a/@b@c@db.abc.supabase.co:5432/postgres yarn test",
    `DATABASE_URL="postgresql://postgres:a b@db.abc.supabase.co:5432/postgres" yarn test`,
    "DATABASE_URL='postgresql://postgres:a b/c@aws-0-us-east-1.pooler.supabase.com:6543/postgres' yarn dev",
    `DATABASE_URL="postgresql://u:p'q@db.abc.supabase.co:5432/postgres" yarn test`,
    `DATABASE_URL='postgresql://u:p"q@db.abc.supabase.co:5432/postgres' yarn test`,
    `DATABASE_URL=postgresql://u:"p w"@db.abc.supabase.co:5432/postgres yarn test`,
    `DATABASE_URL="postgresql://u:a\\"b@aws-0-us-east-1.pooler.supabase.com:6543/postgres" yarn test`,
    // Asks on purpose: a database URL and a hosted name in the same command, even
    // when the URL itself is local (the hook can't tell which part is which).
    "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres yarn test # see supabase.com/docs",
  ])("asks before: %s", (cmd) => {
    expect(decide(cmd)).toContain("Command contains a HOSTED Supabase database URL.");
  });

  it.each([
    "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres yarn test",
    "DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres yarn dev",
    "echo supabase.co",
    "grep -rn supabase.co docs",
  ])("allows: %s", (cmd) => {
    expect(decide(cmd)).toBe("");
  });
});

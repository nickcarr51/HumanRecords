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
});

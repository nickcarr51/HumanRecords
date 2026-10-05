// CI: node scripts/check-migrations.mts origin/<base-branch>
// Needs full history (actions/checkout fetch-depth: 0).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { checkMigrationChanges, findIncludeSeed } from "./lib/migration-rules.mts";

const base = process.argv[2];
if (!base) {
  console.error("usage: node scripts/check-migrations.mts <base-ref>");
  process.exit(2);
}
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" });

const baseFiles = git("ls-tree", "--name-only", `${base}:supabase/migrations/`)
  .split("\n").filter(Boolean).map((f) => `supabase/migrations/${f}`);
// --no-renames: a rename shows as D + A, so it is caught as a deletion.
const changes = git("diff", "--name-status", "--no-renames", `${base}...HEAD`)
  .split("\n").filter(Boolean)
  .map((line) => { const [status, path] = line.split("\t"); return { status, path }; });

const workflows = readdirSync(".github/workflows").map((f) => ({
  path: `.github/workflows/${f}`,
  content: readFileSync(`.github/workflows/${f}`, "utf8"),
}));

const errors = [...checkMigrationChanges(baseFiles, changes), ...findIncludeSeed(workflows)];
if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}
console.log(`Migrations OK (${changes.filter((c) => c.path.startsWith("supabase/migrations/")).length} new).`);

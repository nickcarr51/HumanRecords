// Migrations are add-only: once merged, a file may have already run on a
// hosted database, so editing/deleting it makes the repo lie about the schema.
export type FileChange = { status: string; path: string };

const DIR = "supabase/migrations/";
const NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;

function stamp(path: string): string | null {
  return NAME.exec(path.slice(DIR.length))?.[1] ?? null;
}

export function checkMigrationChanges(baseMigrationFiles: string[], changes: FileChange[]): string[] {
  const errors: string[] = [];
  const baseSet = new Set(baseMigrationFiles);
  const newest = baseMigrationFiles.map(stamp).filter((s): s is string => !!s).sort().at(-1) ?? "";

  for (const c of changes) {
    if (!c.path.startsWith(DIR)) continue;
    if (c.status !== "A" || baseSet.has(c.path)) {
      errors.push(`${c.path}: already-merged migration was ${c.status === "D" ? "deleted" : "changed"} — add a new migration instead`);
      continue;
    }
    const s = stamp(c.path);
    if (!s) {
      errors.push(`${c.path}: name must be <14-digit timestamp>_<snake_name>.sql (use yarn supabase migration new)`);
    } else if (s <= newest) {
      errors.push(`${c.path}: timestamp must be later than ${newest}, the newest merged migration`);
    }
  }
  return errors;
}

export function findIncludeSeed(files: { path: string; content: string }[]): string[] {
  return files
    .filter((f) => f.content.includes("--include-seed"))
    .map((f) => `${f.path}: never seed a hosted database (--include-seed)`);
}

// Parses `git ls-tree --name-only <base> -- supabase/migrations/` output
// (full paths; empty when the base has no migrations dir yet).
export function parseMigrationList(lsTreeOutput: string): string[] {
  return lsTreeOutput.split("\n").filter((p) => p.startsWith(DIR) && p.endsWith(".sql"));
}

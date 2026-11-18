// Rewrites drizzle-kit's pulled schema so every database gives the same file.
// drizzle-kit 0.31.11 lists tables, each table's constraints, indexes and
// policies, and a composite primary key's columns without an ORDER BY, so their
// order follows the database's storage order (a long-lived local database and
// CI's fresh one differ). It also keeps a policy's `using` / `withCheck` only
// for the first policy of each table, so which policy keeps them varies too.
// This sorts all of those and drops every policy's `using` / `withCheck`; the
// real policies are the Supabase migrations, and the app never reads these.
// Anything in a shape this doesn't know throws, so a drizzle-kit format change
// fails `yarn db:pull` instead of writing a half-sorted file.

const PG_CORE_IMPORT = /^import \{ ([^}]+) \} from "drizzle-orm\/pg-core"$/;
const ENUM = /^export const (\w+) = pgEnum\(/;
const TABLE = /^export const (\w+) = pgTable\(/;
const COMPOSITE_PK = /^(\tprimaryKey\(\{ columns: \[)([^\]]+)(\], name: "[^"]+"\}\),)$/;
const POLICY_EXPRESSION = /, (using|withCheck): sql`[^`]*`/g;

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function fail(message: string): never {
  throw new Error(`normalizeSchema: ${message}`);
}

function sortImport(line: string): string {
  const match = PG_CORE_IMPORT.exec(line) ?? fail(`unexpected first line: ${line}`);
  const names = match[1].split(", ").sort(byName);
  return `import { ${names.join(", ")} } from "drizzle-orm/pg-core"`;
}

function stripPolicy(entry: string): string {
  if (!entry.startsWith("\tpgPolicy(")) return entry;
  const stripped = entry.replace(POLICY_EXPRESSION, "").replace(/\s+\}\),$/, " }),");
  if (stripped.includes("sql`")) fail(`policy expression left in: ${entry}`);
  return stripped;
}

function sortPrimaryKey(entry: string): string {
  const match = COMPOSITE_PK.exec(entry);
  if (!match) return entry;
  return match[1] + match[2].split(", ").sort(byName).join(", ") + match[3];
}

// One table block: the column lines stay in order (drizzle-kit orders them by
// column number); the entries after `(table) => [` are sorted.
function normalizeTable(block: string[]): string[] {
  const open = block.indexOf("}, (table) => [");
  if (open === -1) {
    if (block.at(-1) !== "});") fail(`unexpected table end: ${block.at(-1)}`);
    return block;
  }
  if (block.at(-1) !== "]);") fail(`unexpected table end: ${block.at(-1)}`);
  const entries: string[][] = [];
  for (const line of block.slice(open + 1, -1)) {
    if (/^\t[^\t]/.test(line)) entries.push([line]);
    else if (/^\t\t/.test(line) && entries.length) entries.at(-1)!.push(line);
    else fail(`unexpected line in table config: ${line}`);
  }
  const sorted = entries
    .map((lines) => sortPrimaryKey(stripPolicy(lines.join("\n"))))
    .sort(byName);
  return [...block.slice(0, open + 1), ...sorted, "]);"];
}

export function normalizeSchema(text: string): string {
  const lines = text.split("\n");
  if (lines[1] !== 'import { sql } from "drizzle-orm"') fail(`unexpected second line: ${lines[1]}`);

  const enums: string[] = [];
  const tables: { name: string; lines: string[] }[] = [];
  let current: string[] | null = null;
  for (const line of lines.slice(2)) {
    const table = TABLE.exec(line);
    if (table) {
      current = [line];
      tables.push({ name: table[1], lines: current });
    } else if (current) {
      if (line === "") current = null;
      else current.push(line);
    } else if (ENUM.test(line)) {
      enums.push(line);
    } else if (line !== "") {
      fail(`unexpected top-level line: ${line}`);
    }
  }
  if (!tables.length) fail("no tables found");

  const enumName = (line: string) => ENUM.exec(line)![1];
  const sortedEnums = enums.sort((a, b) => byName(enumName(a), enumName(b)));
  const sortedTables = tables
    .sort((a, b) => byName(a.name, b.name))
    .map((t) => normalizeTable(t.lines).join("\n"));

  // Enums stay above the tables: a column calls its enum when the table is defined.
  return [
    sortImport(lines[0]),
    lines[1],
    "",
    ...sortedEnums,
    "",
    "",
    sortedTables.join("\n\n"),
    "",
  ].join("\n");
}

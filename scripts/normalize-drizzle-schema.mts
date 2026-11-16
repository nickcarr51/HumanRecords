// yarn db:pull: node scripts/normalize-drizzle-schema.mts <schema.ts>
// Sorts drizzle-kit's pulled schema in place (see lib/drizzle-schema.mts).
import { readFileSync, writeFileSync } from "node:fs";
import { normalizeSchema } from "./lib/drizzle-schema.mts";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/normalize-drizzle-schema.mts <schema.ts>");
  process.exit(2);
}
writeFileSync(file, normalizeSchema(readFileSync(file, "utf8")));

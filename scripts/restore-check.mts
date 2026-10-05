// Usage (CI): psql … -tA -F, -c "<counts query>" | node scripts/restore-check.mts
import { readFileSync } from "node:fs";
import { checkRestoreCounts, parseCountsRow } from "./lib/restore-check.mts";

const counts = parseCountsRow(readFileSync(0, "utf8"));
console.log(`Restored: ${counts.authUsers} accounts, ${counts.users} users, ${counts.tracks} tracks, ${counts.releases} releases`);
const errors = checkRestoreCounts(counts);
for (const e of errors) console.error(`::error::${e}`);
process.exit(errors.length ? 1 : 0);

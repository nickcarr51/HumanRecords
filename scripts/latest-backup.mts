// Usage (CI): aws s3 ls s3://humanrecords-backups/prod/ … | node scripts/latest-backup.mts
import { readFileSync } from "node:fs";
import { latestBackupStamp } from "./lib/restore-check.mts";

console.log(latestBackupStamp(readFileSync(0, "utf8")));

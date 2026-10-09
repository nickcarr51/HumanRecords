// Pure helpers for the weekly restore drill (.github/workflows/restore-drill.yml).
export type RestoreCounts = { authUsers: number; users: number; tracks: number; releases: number };

const STAMP_LINE = /PRE (\d{8}T\d{6}Z)\//g;

export function latestBackupStamp(lsOutput: string): string {
  const stamps = [...lsOutput.matchAll(STAMP_LINE)].map((m) => m[1]).sort();
  const latest = stamps.at(-1);
  if (!latest) throw new Error("no backups found under humanrecords-backups/prod/");
  return latest;
}

export function parseCountsRow(row: string): RestoreCounts {
  const parts = row.trim().split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) {
    throw new Error(`could not parse counts row: "${row.trim()}"`);
  }
  const [authUsers, users, tracks, releases] = parts;
  return { authUsers, users, tracks, releases };
}

export function checkRestoreCounts(c: RestoreCounts): string[] {
  const errors: string[] = [];
  // Prod always has at least the owner account; zero means the dump lost auth.*.
  if (c.authUsers === 0) errors.push("restored backup has no accounts — auth schema missing from the dump");
  if (c.users !== c.authUsers) errors.push(`account mismatch: auth.users=${c.authUsers}, public.users=${c.users}`);
  return errors;
}

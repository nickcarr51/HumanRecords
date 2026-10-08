// Uploads the seed MP3s into the LOCAL R2 bucket under the keys seed.sql uses.
//   1. Put the files in supabase/seed-media/ (gitignored; download once from the dev bucket).
//   2. yarn r2:seed-local
// Idempotent: skips keys that already exist.
import { readdir, readFile } from "node:fs/promises";
import { AwsClient } from "aws4fetch";
import { assertLocalBucket, missingSeedFiles, SEED_MEDIA } from "./lib/r2-local.mts";

const bucket = assertLocalBucket(process.env.R2_BUCKET_NAME);
const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  throw new Error("Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env.local");
}
const dir = new URL("../supabase/seed-media/", import.meta.url);
const missing = missingSeedFiles(await readdir(dir).catch(() => []));
if (missing.length) {
  console.error(`Missing in supabase/seed-media/:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

const r2 = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
for (const { file, key } of SEED_MEDIA) {
  const url = new URL(`${R2_ENDPOINT}/${bucket}/${key}`);
  if ((await r2.fetch(url, { method: "HEAD" })).ok) {
    console.log(`exists   ${key}  (${file})`);
    continue;
  }
  // encodeURIComponent: song filenames contain spaces and "&".
  const body = await readFile(new URL(encodeURIComponent(file), dir));
  const res = await r2.fetch(url, { method: "PUT", body, headers: { "Content-Type": "audio/mpeg" } });
  if (!res.ok) throw new Error(`PUT ${key} → ${res.status} ${await res.text()}`);
  console.log(`uploaded ${key}  (${file})`);
}

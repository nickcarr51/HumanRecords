// Server-only. Reads and validates R2 credentials from the environment at
// call time (not module load) so serverless / Fluid compute picks up
// per-invocation env, mirroring src/lib/supabase/server.ts.
export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

export function getR2Config(): R2Config {
  const envMap = {
    accountId: "R2_ACCOUNT_ID",
    accessKeyId: "R2_ACCESS_KEY_ID",
    secretAccessKey: "R2_SECRET_ACCESS_KEY",
    bucket: "R2_BUCKET_NAME",
    endpoint: "R2_ENDPOINT",
  } as const;

  const cfg = {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET_NAME,
    endpoint: process.env.R2_ENDPOINT,
  };
  const missing = Object.entries(cfg)
    .filter(([, v]) => !v)
    .map(([k]) => envMap[k as keyof typeof envMap]);
  if (missing.length > 0) {
    throw new Error(`Missing R2 env vars: ${missing.join(", ")}`);
  }
  return cfg as R2Config;
}

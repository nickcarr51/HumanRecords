// Ensures the accounts listed in scripts/users.local.json (gitignored; copy
// scripts/users.example.json) exist on a HOSTED Supabase project with the
// right role. Idempotent: creates missing users, fixes wrong roles, skips the
// rest. Uses admin.createUser (no email is sent); users sign in with OTP.
//
//   node --env-file=.env.develop.local scripts/invite-users.mts --yes
//
// .env.develop.local needs SUPABASE_URL + SUPABASE_SECRET_KEY for the develop
// project. Never point this at production without deciding to on purpose.

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { parseUsersFile } from "./lib/users-file.mts";

const USERS = parseUsersFile(
  JSON.parse(await readFile(new URL("./users.local.json", import.meta.url), "utf8")),
);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY (use --env-file).");
  process.exit(1);
}
console.log(`Target: ${url}`);
if (!process.argv.includes("--yes")) {
  console.error("Re-run with --yes to apply changes to this project.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;

for (const u of USERS) {
  const existing = list.users.find((x) => x.email?.toLowerCase() === u.email);
  if (!existing) {
    const { error } = await admin.auth.admin.createUser({
      email: u.email,
      email_confirm: true,
      app_metadata: { role: u.role },
      user_metadata: { name: u.name },
    });
    if (error) throw error;
    console.log(`created  ${u.email} as ${u.role}`);
    continue;
  }

  const { data: row, error: rowError } = await admin.from("users").select("role").eq("id", existing.id).single();
  if (rowError) throw rowError;
  if (row.role === u.role) {
    console.log(`ok       ${u.email} is ${u.role}`);
  } else {
    const { error } = await admin.from("users").update({ role: u.role }).eq("id", existing.id);
    if (error) throw error;
    console.log(`updated  ${u.email}: ${row.role} → ${u.role}`);
  }
}

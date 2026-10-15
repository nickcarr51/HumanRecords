"use server";

// Admin user management. Every action re-checks the caller's role (the
// /admin layout doesn't protect server actions). Account creation needs the
// service role (auth admin API); the invites table is service-role only.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { upsertInvite } from "@/lib/invites/store";
import { generateInviteToken } from "@/lib/invites/token";
import { activeLabelMemberId } from "./caller";
import { USER_ROLES, type ActionResult, type UserRole } from "./users-types";

const FORBIDDEN = "Only label members can do this.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 100;

// The caller's user id if they're an active label member, else null.
const labelMemberId = activeLabelMemberId;

function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

export async function createUser(input: {
  email: string;
  name: string;
  role: UserRole;
}): Promise<ActionResult> {
  const caller = await labelMemberId();
  if (!caller) return { error: FORBIDDEN };

  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email." };
  if (!isRole(input.role)) return { error: "Pick a role." };
  const name = typeof input.name === "string" ? input.name.trim().slice(0, MAX_NAME_LENGTH) : "";

  const service = createServiceClient();
  const { data, error } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: input.role },
    user_metadata: { name: name || null },
  });
  if (error || !data.user) {
    if (error && /already|exists|registered/i.test(error.message)) {
      return { error: "That email already has an account — use its row in the table." };
    }
    console.error("createUser failed", error);
    return { error: "Couldn't create the account. Try again." };
  }

  try {
    await upsertInvite(service, { userId: data.user.id, token: generateInviteToken(), createdBy: caller });
  } catch (err) {
    console.error("Invite insert failed after createUser", err);
    revalidatePath("/admin/users");
    return { error: "Account created, but the invite link failed — use Create link in the table." };
  }

  revalidatePath("/admin/users");
  return { error: null };
}

// Create link + Regenerate: a fresh token; any previous token stops working.
export async function issueInvite(userId: string): Promise<ActionResult> {
  const caller = await labelMemberId();
  if (!caller) return { error: FORBIDDEN };
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return { error: "Unknown user." };

  try {
    await upsertInvite(createServiceClient(), { userId, token: generateInviteToken(), createdBy: caller });
  } catch (err) {
    console.error("issueInvite failed", err);
    return { error: "Couldn't create the link. Try again." };
  }
  revalidatePath("/admin/users");
  return { error: null };
}

export async function setUserRole(userId: string, role: UserRole): Promise<ActionResult> {
  const caller = await labelMemberId();
  if (!caller) return { error: FORBIDDEN };
  if (!isRole(role)) return { error: "Pick a role." };
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return { error: "Unknown user." };
  if (userId === caller) return { error: "You can't change your own role." };

  // Cookie client: admin_set_user_role re-checks both rules in Postgres.
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_role", { target: userId, new_role: role });
  if (error) {
    if (error.code === "42501") return { error: FORBIDDEN };
    if (error.code === "22023") return { error: "You can't change your own role." };
    if (error.code === "P0002") return { error: "That user no longer exists." };
    console.error("admin_set_user_role failed", error);
    return { error: "Couldn't save the role. Try again." };
  }
  revalidatePath("/admin/users");
  return { error: null };
}

const DEACTIVATE_BAN = "876000h"; // ~100 years; Supabase has no "forever"
const NOT_FOUND_RE = /not.?found/i;

function revalidateUser(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

// Admin sets the email directly (email_confirm: no confirmation email is sent).
// The name lives in public.users.name (what the app reads) and in
// user_metadata.name; nothing syncs them, so both are written.
export async function updateUserProfile(
  userId: string,
  input: { name: string; email: string },
): Promise<ActionResult> {
  const caller = await labelMemberId();
  if (!caller) return { error: FORBIDDEN };
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return { error: "Unknown user." };
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email." };
  const name = typeof input.name === "string" ? input.name.trim().slice(0, MAX_NAME_LENGTH) || null : null;

  const service = createServiceClient();
  const { data: current, error: getError } = await service.auth.admin.getUserById(userId);
  if (getError || !current?.user) {
    if (!getError || NOT_FOUND_RE.test(getError.message)) return { error: "That user no longer exists." };
    console.error("getUserById failed", getError);
    return { error: "Couldn't save. Try again." };
  }

  const emailChanged = (current.user.email ?? "").toLowerCase() !== email;
  const { error: authError } = await service.auth.admin.updateUserById(
    userId,
    emailChanged ? { email, email_confirm: true, user_metadata: { name } } : { user_metadata: { name } },
  );
  if (authError) {
    if (/already|exists|registered/i.test(authError.message)) return { error: "That email already has an account." };
    if (NOT_FOUND_RE.test(authError.message)) return { error: "That user no longer exists." };
    console.error("updateUserById failed", authError);
    return { error: "Couldn't save. Try again." };
  }

  const { error: nameError } = await service.from("users").update({ name }).eq("id", userId);
  revalidateUser(userId);
  // Editing yourself: re-render the (app) layout so the nav shows the new name.
  // (The nav's email comes from the session token and updates on its next refresh.)
  if (userId === caller) revalidatePath("/", "layout");
  if (nameError) {
    console.error("users.name update failed after auth update", nameError);
    return { error: emailChanged ? "Email saved, but the name didn't. Try again." : "Couldn't save the name. Try again." };
  }
  return { error: null };
}

// Deactivate = Supabase auth ban (reversible; download history kept).
export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const caller = await labelMemberId();
  if (!caller) return { error: FORBIDDEN };
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return { error: "Unknown user." };
  if (userId === caller) {
    return { error: active ? "You can't reactivate yourself." : "You can't deactivate yourself." };
  }

  const { error } = await createServiceClient().auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : DEACTIVATE_BAN,
  });
  if (error) {
    if (NOT_FOUND_RE.test(error.message)) return { error: "That user no longer exists." };
    console.error("setUserActive failed", error);
    return { error: "Couldn't save. Try again." };
  }
  revalidateUser(userId);
  return { error: null };
}

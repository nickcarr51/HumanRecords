// Client-safe types for the admin users page.
import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export const USER_ROLES: readonly UserRole[] = ["listener", "artist", "label_member"];

export const ROLE_LABELS: Record<UserRole, string> = {
  listener: "Listener",
  artist: "Artist",
  label_member: "Label member",
};

export type InviteState =
  | { status: "none" }
  | { status: "unused"; url: string }
  | { status: "used"; usedAt: string };

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
  invite: InviteState;
};

export type ActionResult = { error: string | null };

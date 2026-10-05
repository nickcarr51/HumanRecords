// Validates scripts/users.local.json (gitignored) so the invite script never
// creates a malformed account. Real emails live only in that local file.
export type InviteUser = { email: string; role: "listener" | "artist" | "label_member"; name: string };

const ROLES = new Set(["listener", "artist", "label_member"]);

export function parseUsersFile(raw: unknown): InviteUser[] {
  if (!Array.isArray(raw)) throw new Error("users file must be a JSON array");
  return raw.map((entry, i) => {
    const e = entry as Record<string, unknown>;
    if (typeof e.email !== "string" || !e.email.includes("@")) {
      throw new Error(`entry ${i}: email is required`);
    }
    if (typeof e.role !== "string" || !ROLES.has(e.role)) {
      throw new Error(`entry ${i}: role must be listener, artist, or label_member`);
    }
    if (typeof e.name !== "string" || !e.name.trim()) {
      throw new Error(`entry ${i}: name is required`);
    }
    return { email: e.email.trim().toLowerCase(), role: e.role as InviteUser["role"], name: e.name.trim() };
  });
}

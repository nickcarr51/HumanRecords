import "server-only";
import { randomBytes } from "crypto";

// 32 random bytes → 43 base64url chars. Unguessable; single-use via the store.
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

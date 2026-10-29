// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createTestUser } from "@/lib/supabase/test-helpers";
import { authorize } from "./policy";
import { getViewer } from "./viewer";

// The rules for the slice 2 writes, with Viewers from getViewer() for real
// signed-in users: label members only, each refusal with its own message.
const admin = createAdminClient();
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function viewerWith(role: "listener" | "artist" | "label_member") {
  const user = await createTestUser({ role });
  cleanups.push(user.cleanup);
  return getViewer(await user.signIn());
}

const RULES = [
  ["users.setRole", "Only label members can change roles."],
  ["artists.delete", "Only label members can delete artists."],
] as const;

describe.each(RULES)("authorize %s (real signed-in users)", (action, message) => {
  it("grants it to a label member, for that action only", async () => {
    const grant = authorize(await viewerWith("label_member"), action);
    expect(grant.action).toBe(action);
    expect(Object.isFrozen(grant)).toBe(true);
  });

  it.each(["listener", "artist"] as const)("forbids it for %s, with its own message", async (role) => {
    const viewer = await viewerWith(role);
    expect(() => authorize(viewer, action)).toThrow(
      expect.objectContaining({ name: "DomainError", code: "FORBIDDEN", message }),
    );
  });

  it("forbids it for a user with no role (no public.users row)", async () => {
    const user = await createTestUser({ role: "label_member" });
    cleanups.push(user.cleanup);
    const client = await user.signIn();
    const { error } = await admin.from("users").delete().eq("id", user.id);
    if (error) throw error;
    const viewer = await getViewer(client);
    expect(viewer.role).toBeNull();
    expect(() => authorize(viewer, action)).toThrow(
      expect.objectContaining({ name: "DomainError", code: "FORBIDDEN", message }),
    );
  });

  it("refuses a copy of a real label member's Viewer", async () => {
    const viewer = await viewerWith("label_member");
    expect(() => authorize({ ...viewer }, action)).toThrow(
      expect.objectContaining({ name: "DomainError", code: "FORBIDDEN", message: "Not authorized." }),
    );
  });
});

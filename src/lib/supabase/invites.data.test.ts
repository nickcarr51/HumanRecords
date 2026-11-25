import { afterEach, describe, expect, it } from "vitest";
import { createAnonClient, createTestUser } from "./test-helpers";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function user(role: "listener" | "artist" | "label_member", name = "Test User") {
  const u = await createTestUser({ role, name });
  cleanups.push(u.cleanup);
  return u;
}

describe("invites table", () => {
  it("is invisible to anon and authenticated", async () => {
    const listener = await user("listener");
    const client = await listener.signIn();
    for (const c of [createAnonClient(), client]) {
      const { error: selectError } = await c.from("invites").select("user_id");
      expect(selectError).not.toBeNull();
      const { error: insertError } = await c.from("invites").insert({ user_id: listener.id, token: "x" });
      expect(insertError).not.toBeNull();
      const { error: updateError } = await c.from("invites").update({ token: "y" }).eq("user_id", listener.id);
      expect(updateError).not.toBeNull();
    }
  });
});

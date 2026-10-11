import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient, createAnonClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
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

describe("admin_list_users", () => {
  it("returns every user with email, name, role and invite state to label members", async () => {
    const label = await user("label_member");
    const guest = await user("artist", "Guest Person");
    await admin.from("invites").insert({ user_id: guest.id, token: "tok-list-test", created_by: label.id });

    const client = await label.signIn();
    const { data, error } = await client.rpc("admin_list_users");
    expect(error).toBeNull();
    const row = data!.find((r: { id: string }) => r.id === guest.id);
    expect(row).toMatchObject({
      email: guest.email,
      name: "Guest Person",
      role: "artist",
      invite_token: "tok-list-test",
      invite_used_at: null,
    });
    const self = data!.find((r: { id: string }) => r.id === label.id);
    expect(self).toMatchObject({ invite_token: null, invite_used_at: null });
  });

  it("refuses non-label-members", async () => {
    const client = await (await user("listener")).signIn();
    const { error } = await client.rpc("admin_list_users");
    expect(error?.code).toBe("42501");
  });
});

describe("admin_set_user_role", () => {
  it("lets a label member change another user's role", async () => {
    const label = await user("label_member");
    const target = await user("listener");
    const client = await label.signIn();
    const { error } = await client.rpc("admin_set_user_role", { target: target.id, new_role: "artist" });
    expect(error).toBeNull();
    const { data } = await admin.from("users").select("role").eq("id", target.id).single();
    expect(data!.role).toBe("artist");
  });

  it("refuses changing your own role", async () => {
    const label = await user("label_member");
    const client = await label.signIn();
    const { error } = await client.rpc("admin_set_user_role", { target: label.id, new_role: "listener" });
    expect(error?.code).toBe("22023");
    const { data } = await admin.from("users").select("role").eq("id", label.id).single();
    expect(data!.role).toBe("label_member");
  });

  it("refuses non-label-members", async () => {
    const target = await user("listener");
    const client = await (await user("artist")).signIn();
    const { error } = await client.rpc("admin_set_user_role", { target: target.id, new_role: "label_member" });
    expect(error?.code).toBe("42501");
  });

  it("reports an unknown user", async () => {
    const client = await (await user("label_member")).signIn();
    const { error } = await client.rpc("admin_set_user_role", {
      target: "00000000-0000-0000-0000-000000000000",
      new_role: "artist",
    });
    expect(error?.code).toBe("P0002");
  });
});

describe("admin_list_users banned_until", () => {
  it("reports the auth ban for a deactivated user", async () => {
    const admin = createAdminClient();
    const label = await createTestUser({ role: "label_member" });
    const target = await createTestUser({ role: "listener" });
    try {
      await admin.auth.admin.updateUserById(target.id, { ban_duration: "876000h" });
      const client = await label.signIn();
      const { data, error } = await client.rpc("admin_list_users");
      expect(error).toBeNull();
      const row = (data as Array<{ id: string; banned_until: string | null }>).find((r) => r.id === target.id);
      expect(row?.banned_until).toBeTruthy();
      const self = (data as Array<{ id: string; banned_until: string | null }>).find((r) => r.id === label.id);
      expect(self?.banned_until).toBeNull();
    } finally {
      await target.cleanup();
      await label.cleanup();
    }
  });
});

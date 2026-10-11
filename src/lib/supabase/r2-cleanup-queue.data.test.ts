import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createAdminClient, createTestUser } from "./test-helpers";

const admin = createAdminClient();
const ids: string[] = [];

afterEach(async () => {
  if (ids.length) await admin.from("r2_cleanup_queue").delete().in("id", ids.splice(0));
});

describe("r2_cleanup_queue", () => {
  it("accepts a queued key from the service role", async () => {
    const { data, error } = await admin
      .from("r2_cleanup_queue")
      .insert({ object_key: `tracks/${randomUUID()}.mp3`, reason: "replaced", source_table: "tracks", source_id: randomUUID() })
      .select("id, queued_at, cleaned_at")
      .single();
    expect(error).toBeNull();
    ids.push(data!.id);
    expect(data!.queued_at).toBeTruthy();
    expect(data!.cleaned_at).toBeNull();
  });

  it("rejects an unknown reason", async () => {
    const { error } = await admin
      .from("r2_cleanup_queue")
      .insert({ object_key: "x", reason: "deleted", source_table: "tracks", source_id: randomUUID() });
    expect(error?.code).toBe("23514");
  });

  it("is invisible and unwritable to signed-in users, even label members", async () => {
    const { data } = await admin
      .from("r2_cleanup_queue")
      .insert({ object_key: "x", reason: "archived", source_table: "albums", source_id: randomUUID() })
      .select("id")
      .single();
    ids.push(data!.id);
    const user = await createTestUser({ role: "label_member" });
    try {
      const client = await user.signIn();
      const read = await client.from("r2_cleanup_queue").select("id");
      expect(read.data ?? []).toEqual([]);
      const write = await client
        .from("r2_cleanup_queue")
        .insert({ object_key: "y", reason: "archived", source_table: "albums", source_id: randomUUID() });
      expect(write.error).not.toBeNull();
    } finally {
      await user.cleanup();
    }
  });
});

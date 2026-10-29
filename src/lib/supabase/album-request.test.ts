import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getAlbum } from "./albums";

// The request getAlbum sends, captured by a stand-in client: a signed-in
// session (getClaims answers with a user id) and a query builder that keeps
// the select() text and answers "no such album". Nothing connects.
function standIn() {
  const selects: string[] = [];
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },
    from: (table: string) => ({
      select: (columns: string) => {
        selects.push(`${table}: ${columns}`);
        return { eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
      },
    }),
  };
  return { client: client as unknown as SupabaseClient<Database>, selects };
}

describe("the album page's request", () => {
  it("doesn't ask for track art, as before Drizzle", async () => {
    const { client, selects } = standIn();
    expect(await getAlbum(client, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(selects).toHaveLength(1);
    expect(selects[0]).toMatch(/^albums: /);
    expect(selects[0]).not.toContain("track_art_url");
  });
});

import "server-only";
import { eq } from "drizzle-orm";
import { artists, r2CleanupQueue } from "@/lib/db/generated/schema";
import { asSystem } from "@/lib/db/system";
import { authorize } from "./policy";
import { DomainError } from "./errors";
import type { Viewer } from "./viewer";

// Deletes an artist and, in the same transaction, queues their photo for
// removal from storage. Replaces the admin_delete_artist() SQL function: label
// members only; NOT_FOUND when there's no such artist; an artist still credited
// on a track or album can't be deleted (the credit foreign keys refuse with
// 23503, which asSystem turns into CONFLICT), and then nothing changes and
// nothing is queued.
// Uses asSystem (admin access, RLS bypassed, only after authorize() has
// confirmed permission) because signed-in users have no delete policy on
// artists and no access to r2_cleanup_queue.
export async function removeArtist(viewer: Viewer, id: string): Promise<void> {
  const grant = authorize(viewer, "artists.delete");
  await asSystem(grant, "artists.delete", async (tx) => {
    const [deleted] = await tx
      .delete(artists)
      .where(eq(artists.id, id))
      .returning({ photo: artists.profilePhotoUrl });
    if (!deleted) throw new DomainError("NOT_FOUND", "Artist not found.");
    if (deleted.photo !== null) {
      await tx
        .insert(r2CleanupQueue)
        .values({ objectKey: deleted.photo, reason: "archived", sourceTable: "artists", sourceId: id });
    }
  });
}

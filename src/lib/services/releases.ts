import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { albums, r2CleanupQueue, releases, trackAlbums, tracks } from "@/lib/db/generated/schema";
import type { Tx } from "@/lib/db/client";
import { asSystem } from "@/lib/db/system";
import { DomainError } from "./errors";
import { authorize } from "./policy";
import type { Viewer } from "./viewer";

// The release admin writes: archive/restore a release, remove/restore an
// album track, replace a track's MP3, move a release up or down. They replace
// the SQL functions archive_release, restore_release, archive_track,
// restore_track, replace_track_audio and move_release, with the same checks in
// the same order and the same messages. Two deliberate differences: restore
// finds the tracks to bring back by tracks.archived_with_release instead of
// matching archived_at, and the shared-track checks are gone (the database
// keeps every track on one release).
// Each runs after authorize() in one asSystem transaction: signed-in users
// can only read releases and tracks, and can't touch r2_cleanup_queue.
// Timestamps are set with the transaction's now() and never pass through a
// JavaScript Date (they stay text, with microseconds).

type Release = typeof releases.$inferSelect;
type QueueRow = typeof r2CleanupQueue.$inferInsert;

// Locks the release (select ... for update), or undefined when it doesn't exist.
async function lockRelease(tx: Tx, id: string): Promise<Release | undefined> {
  const [rel] = await tx.select().from(releases).where(eq(releases.id, id)).for("update");
  return rel;
}

// Locks the release that owns a track: the single whose track it is, or the
// release of the album it's on. Undefined for an unknown or orphan track.
async function lockReleaseForTrack(tx: Tx, trackId: string): Promise<Release | undefined> {
  const albumOf = tx.select({ id: trackAlbums.albumId }).from(trackAlbums).where(eq(trackAlbums.trackId, trackId));
  const [rel] = await tx
    .select()
    .from(releases)
    .where(or(eq(releases.trackId, trackId), inArray(releases.albumId, albumOf)))
    .for("update");
  return rel;
}

async function lockTrack(tx: Tx, id: string) {
  const [trk] = await tx.select().from(tracks).where(eq(tracks.id, id)).for("update");
  return trk;
}

async function sortAtOf(tx: Tx, id: string): Promise<string> {
  const [row] = await tx.select({ sortAt: releases.sortAt }).from(releases).where(eq(releases.id, id));
  return row.sortAt;
}

// A single's track, or every track on the album.
async function trackIdsOf(tx: Tx, rel: Release): Promise<string[]> {
  if (rel.trackId !== null) return [rel.trackId];
  if (rel.albumId === null) return [];
  const rows = await tx.select({ id: trackAlbums.trackId }).from(trackAlbums).where(eq(trackAlbums.albumId, rel.albumId));
  return rows.map((r) => r.id);
}

// A track's audio and art keys (art only when set), queued as archived.
function trackFiles(t: { id: string; audioUrl: string; trackArtUrl: string | null }): QueueRow[] {
  return [t.audioUrl, t.trackArtUrl]
    .filter((key): key is string => key !== null)
    .map((key) => ({ objectKey: key, reason: "archived", sourceTable: "tracks", sourceId: t.id }));
}

async function queue(tx: Tx, rows: QueueRow[]): Promise<void> {
  if (rows.length) await tx.insert(r2CleanupQueue).values(rows);
}

async function queueAlbumArt(tx: Tx, albumId: string): Promise<void> {
  const [album] = await tx.select({ art: albums.albumArtUrl }).from(albums).where(eq(albums.id, albumId));
  if (album && album.art !== null) await queue(tx, [{ objectKey: album.art, reason: "archived", sourceTable: "albums", sourceId: albumId }]);
}

// Queue rows for these tracks, or for this album.
function queuedFor(trackIds: string[], albumId: string | null) {
  return or(
    and(eq(r2CleanupQueue.sourceTable, "tracks"), inArray(r2CleanupQueue.sourceId, trackIds)),
    albumId === null ? undefined : and(eq(r2CleanupQueue.sourceTable, "albums"), eq(r2CleanupQueue.sourceId, albumId)),
  );
}

// Archives the release and its live tracks (flagged as archived with it) and
// queues their files. Already archived: no-op.
export async function archiveRelease(viewer: Viewer, releaseId: string): Promise<void> {
  const grant = authorize(viewer, "releases.archive");
  await asSystem(grant, "releases.archive", async (tx) => {
    const rel = await lockRelease(tx, releaseId);
    if (!rel) throw new DomainError("NOT_FOUND", "Release not found.");
    if (rel.archivedAt !== null) return;

    await tx.update(releases).set({ archivedAt: sql`now()` }).where(eq(releases.id, rel.id));
    const archived = await tx
      .update(tracks)
      .set({ archivedAt: sql`now()`, archivedWithRelease: true })
      .where(and(isNull(tracks.archivedAt), inArray(tracks.id, await trackIdsOf(tx, rel))))
      .returning({ id: tracks.id, audioUrl: tracks.audioUrl, trackArtUrl: tracks.trackArtUrl });
    await queue(tx, archived.flatMap(trackFiles));
    if (rel.albumId !== null) await queueAlbumArt(tx, rel.albumId);
  });
}

// Restores the release and the tracks archived with it, and drops their
// pending queue rows. Refused when a file was already deleted from storage.
// Live release: no-op.
export async function restoreRelease(viewer: Viewer, releaseId: string): Promise<void> {
  const grant = authorize(viewer, "releases.restore");
  await asSystem(grant, "releases.restore", async (tx) => {
    const rel = await lockRelease(tx, releaseId);
    if (!rel) throw new DomainError("NOT_FOUND", "Release not found.");
    if (rel.archivedAt === null) return;

    const withRelease = await tx
      .select({ id: tracks.id })
      .from(tracks)
      .where(and(eq(tracks.archivedWithRelease, true), inArray(tracks.id, await trackIdsOf(tx, rel))));
    const trackIds = withRelease.map((t) => t.id);
    const archivedQueue = and(eq(r2CleanupQueue.reason, "archived"), queuedFor(trackIds, rel.albumId));

    const [cleaned] = await tx
      .select({ id: r2CleanupQueue.id })
      .from(r2CleanupQueue)
      .where(and(archivedQueue, isNotNull(r2CleanupQueue.cleanedAt)))
      .limit(1);
    if (cleaned) {
      throw new DomainError(
        "INVALID",
        "Some files for this release were already deleted from storage; it can't be restored.",
      );
    }

    await tx.update(releases).set({ archivedAt: null }).where(eq(releases.id, rel.id));
    await tx.update(tracks).set({ archivedAt: null, archivedWithRelease: false }).where(inArray(tracks.id, trackIds));
    await tx.delete(r2CleanupQueue).where(and(archivedQueue, isNull(r2CleanupQueue.cleanedAt)));
  });
}

// Removes one album track and queues its files. Removing the album's last
// live track archives the album too, and that track is flagged as archived
// with it, so restoring the album brings it back. Already removed: no-op.
export async function archiveTrack(viewer: Viewer, trackId: string): Promise<void> {
  const grant = authorize(viewer, "tracks.archive");
  await asSystem(grant, "tracks.archive", async (tx) => {
    const rel = await lockReleaseForTrack(tx, trackId);
    if (!rel) throw new DomainError("NOT_FOUND", "Track not found.");
    // A release has an album exactly when it isn't a single (releases_kind_matches_target).
    const albumId = rel.albumId;
    if (rel.kind === "single" || albumId === null) throw new DomainError("INVALID", "Archive the single instead.");
    const trk = await lockTrack(tx, trackId);
    if (trk && trk.archivedAt !== null) return;
    if (rel.archivedAt !== null) throw new DomainError("INVALID", "This album is archived.");

    const [otherLive] = await tx
      .select({ id: tracks.id })
      .from(trackAlbums)
      .innerJoin(tracks, eq(tracks.id, trackAlbums.trackId))
      .where(and(eq(trackAlbums.albumId, albumId), isNull(tracks.archivedAt), ne(tracks.id, trackId)))
      .limit(1);
    const last = otherLive === undefined;

    const archived = await tx
      .update(tracks)
      .set({ archivedAt: sql`now()`, archivedWithRelease: last })
      .where(eq(tracks.id, trackId))
      .returning({ id: tracks.id, audioUrl: tracks.audioUrl, trackArtUrl: tracks.trackArtUrl });
    await queue(tx, archived.flatMap(trackFiles));

    if (last) {
      await tx.update(releases).set({ archivedAt: sql`now()` }).where(eq(releases.id, rel.id));
      await queueAlbumArt(tx, albumId);
    }
  });
}

// Restores one removed album track and drops its pending queue rows. Refused
// for a single, while the album is archived, or when its file was already
// deleted from storage. Live track: no-op.
export async function restoreTrack(viewer: Viewer, trackId: string): Promise<void> {
  const grant = authorize(viewer, "tracks.restore");
  await asSystem(grant, "tracks.restore", async (tx) => {
    const rel = await lockReleaseForTrack(tx, trackId);
    if (!rel) throw new DomainError("NOT_FOUND", "Track not found.");
    if (rel.kind === "single") throw new DomainError("INVALID", "Restore the single instead.");
    if (rel.archivedAt !== null) throw new DomainError("INVALID", "Restore the album first.");
    const trk = await lockTrack(tx, trackId);
    if (!trk || trk.archivedAt === null) return;

    const archivedQueue = and(eq(r2CleanupQueue.reason, "archived"), queuedFor([trk.id], null));
    const [cleaned] = await tx
      .select({ id: r2CleanupQueue.id })
      .from(r2CleanupQueue)
      .where(and(archivedQueue, isNotNull(r2CleanupQueue.cleanedAt)))
      .limit(1);
    if (cleaned) throw new DomainError("INVALID", "This track's file was already deleted from storage.");

    await tx.update(tracks).set({ archivedAt: null }).where(eq(tracks.id, trk.id));
    await tx.delete(r2CleanupQueue).where(and(archivedQueue, isNull(r2CleanupQueue.cleanedAt)));
  });
}

// Points a track at a new MP3 and queues the old one as replaced.
export async function replaceTrackAudio(viewer: Viewer, trackId: string, audioKey: string): Promise<void> {
  const grant = authorize(viewer, "tracks.replaceAudio");
  await asSystem(grant, "tracks.replaceAudio", async (tx) => {
    if (!(await lockReleaseForTrack(tx, trackId))) throw new DomainError("NOT_FOUND", "Track not found.");
    const trk = await lockTrack(tx, trackId);
    if (!trk) throw new DomainError("NOT_FOUND", "Track not found.");
    if (trk.archivedAt !== null) throw new DomainError("INVALID", "Restore this track before replacing its file.");
    // Postgres trim(), which the SQL function used, strips spaces only.
    if (audioKey.replace(/^ +| +$/g, "") === "") throw new DomainError("INVALID", "No audio file.");
    if (audioKey === trk.audioUrl) throw new DomainError("INVALID", "That file is already on this track.");

    await queue(tx, [{ objectKey: trk.audioUrl, reason: "replaced", sourceTable: "tracks", sourceId: trk.id }]);
    await tx.update(tracks).set({ audioUrl: audioKey }).where(eq(tracks.id, trk.id));
  });
}

// Moves a live release one place up or down within its pinned group (feed
// order: pinned desc, sort_at desc, id desc) by swapping sort_at with its
// neighbour. At the edge of its group: no-op.
export async function moveRelease(viewer: Viewer, releaseId: string, direction: string): Promise<void> {
  const grant = authorize(viewer, "releases.move");
  if (direction !== "up" && direction !== "down") throw new DomainError("INVALID", "direction must be up or down");
  await asSystem(grant, "releases.move", async (tx) => {
    const cur = await lockRelease(tx, releaseId);
    if (!cur) throw new DomainError("NOT_FOUND", "Release not found.");
    if (cur.archivedAt !== null) throw new DomainError("INVALID", "Archived releases cannot be moved.");

    const sameGroup = and(eq(releases.pinned, cur.pinned), isNull(releases.archivedAt));
    const [nb] =
      direction === "up"
        ? await tx
            .select()
            .from(releases)
            .where(and(sameGroup, sql`(${releases.sortAt}, ${releases.id}) > (${cur.sortAt}, ${cur.id})`))
            .orderBy(asc(releases.sortAt), asc(releases.id))
            .limit(1)
            .for("update")
        : await tx
            .select()
            .from(releases)
            .where(and(sameGroup, sql`(${releases.sortAt}, ${releases.id}) < (${cur.sortAt}, ${cur.id})`))
            .orderBy(desc(releases.sortAt), desc(releases.id))
            .limit(1)
            .for("update");
    if (!nb) return;

    // A swap only moves the release if both values are unique in the group.
    // Otherwise first space the group's live rows at least 1 ms apart, in feed
    // order, rewriting only rows that change (the SQL function's statement).
    const [shared] = await tx
      .select({ id: releases.id })
      .from(releases)
      .where(and(sameGroup, notInArray(releases.id, [cur.id, nb.id]), inArray(releases.sortAt, [cur.sortAt, nb.sortAt])))
      .limit(1);
    let [curAt, nbAt] = [cur.sortAt, nb.sortAt];
    if (curAt === nbAt || shared) {
      await tx.execute(sql`
        update public.releases r
        set sort_at = n.v
        from (
          select id, sort_at as s,
                 min(sort_at + rn * interval '1 millisecond')
                   over (order by sort_at desc, id desc
                         rows between unbounded preceding and current row)
                   - rn * interval '1 millisecond' as v
          from (
            select id, sort_at,
                   row_number() over (order by sort_at desc, id desc) - 1 as rn
            from public.releases
            where pinned = ${cur.pinned} and archived_at is null
          ) ranked
        ) n
        where r.id = n.id and n.v <> n.s`);
      [curAt, nbAt] = [await sortAtOf(tx, cur.id), await sortAtOf(tx, nb.id)];
    }

    await tx.update(releases).set({ sortAt: nbAt }).where(eq(releases.id, cur.id));
    await tx.update(releases).set({ sortAt: curAt }).where(eq(releases.id, nb.id));
  });
}

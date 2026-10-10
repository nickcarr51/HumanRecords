import { describe, expect, it } from "vitest";
import type { AdminRelease } from "@/lib/admin/releases";
import { buildEditPayload, draftFrom, editReducer, hasDraftErrors, isDraftDirty, pendingInDraft, validateDraft } from "./edit-reducer";

const album: AdminRelease = {
  id: "r1", kind: "album", title: "Night", pinned: false, archived: false,
  album: { title: "Night", artists: [{ id: "a1", name: "Nova" }] },
  tracks: [
    { id: "t1", title: "One", artists: [{ id: "a1", name: "Nova" }], archived: false },
    { id: "t2", title: "Gone", artists: [{ id: "a1", name: "Nova" }], archived: true },
    { id: "t3", title: "Three", artists: [{ id: "a2", name: "Kite" }], archived: false },
  ],
};
const single: AdminRelease = {
  id: "r2", kind: "single", title: "Solo", pinned: false, archived: false, album: null,
  tracks: [{ id: "s1", title: "Solo", artists: [{ id: "a1", name: "Nova" }], archived: false }],
};

describe("edit reducer", () => {
  it("drafts only live tracks and starts clean", () => {
    const s = draftFrom(album);
    expect(s.tracks.map((t) => t.id)).toEqual(["t1", "t3"]);
    expect(s.album?.artists.map((c) => c.key)).toEqual(["id:a1"]);
    expect(isDraftDirty(s, album)).toBe(false);
    expect(draftFrom(single).album).toBeNull();
  });

  it("tracks edits, reorders, and becomes clean again when reverted", () => {
    let s = draftFrom(album);
    s = editReducer(s, { type: "moveTrack", id: "t3", dir: -1 });
    expect(s.tracks.map((t) => t.id)).toEqual(["t3", "t1"]);
    expect(isDraftDirty(s, album)).toBe(true);
    s = editReducer(s, { type: "moveTrack", id: "t3", dir: 1 });
    expect(isDraftDirty(s, album)).toBe(false);
    s = editReducer(s, { type: "setTrackTitle", id: "t1", title: "Uno" });
    s = editReducer(s, { type: "addTrackArtist", id: "t1", chip: { key: "new:fresh", id: null, name: "Fresh" } });
    expect(pendingInDraft(s).map((c) => c.name)).toEqual(["Fresh"]);
    expect(isDraftDirty(s, album)).toBe(true);
    expect(isDraftDirty(editReducer(s, { type: "reset", release: album }), album)).toBe(false);
  });

  it("validates whitespace-only titles and empty artist lists", () => {
    let s = draftFrom(album);
    s = editReducer(s, { type: "setAlbumTitle", title: "   " });
    s = editReducer(s, { type: "setTrackTitle", id: "t1", title: "  " });
    s = editReducer(s, { type: "removeTrackArtist", id: "t3", key: "id:a2" });
    const e = validateDraft(s);
    expect(e).toEqual({
      albumTitle: "Album title is required.",
      tracks: { t1: { title: "Title is required." }, t3: { artists: "Add at least one artist." } },
    });
    expect(hasDraftErrors(e)).toBe(true);
    expect(hasDraftErrors(validateDraft(draftFrom(album)))).toBe(false);
  });

  it("builds a trimmed payload with refs; no album key for singles", () => {
    let s = draftFrom(album);
    s = editReducer(s, { type: "setAlbumTitle", title: "  Night II " });
    s = editReducer(s, { type: "addAlbumArtist", chip: { key: "new:fresh", id: null, name: "Fresh" } });
    expect(buildEditPayload(s)).toEqual({
      album: { title: "Night II", artists: [{ id: "a1" }, { newName: "Fresh" }] },
      tracks: [
        { id: "t1", title: "One", artists: [{ id: "a1" }] },
        { id: "t3", title: "Three", artists: [{ id: "a2" }] },
      ],
    });
    expect(buildEditPayload(draftFrom(single))).toEqual({ tracks: [{ id: "s1", title: "Solo", artists: [{ id: "a1" }] }] });
  });

  it("trailing whitespace alone is not a change", () => {
    let s = draftFrom(album);
    s = editReducer(s, { type: "setAlbumTitle", title: "Night  " });
    s = editReducer(s, { type: "setTrackTitle", id: "t1", title: "One " });
    expect(isDraftDirty(s, album)).toBe(false);
  });
});

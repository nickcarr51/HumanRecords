import { describe, expect, it } from "vitest";
import {
  buildPayload,
  createInitialState,
  existingChip,
  hasErrors,
  isDirty,
  needsKindConfirm,
  newChip,
  pendingNewArtists,
  titleFromFilename,
  uploadReducer as r,
  validate,
  type UploadState,
} from "./upload-reducer";

const mp3 = (name = "Song.mp3", size = 1000) => new File([new Uint8Array(size)], name, { type: "audio/mpeg" });
const init = () => createInitialState("t1");
const t = (s: UploadState, i = 0) => s.tracks[i];

function album(): UploadState {
  let s = r(init(), { type: "setKind", kind: "album" });
  s = r(s, { type: "addTrack", clientId: "t2" });
  return s;
}

describe("initial state", () => {
  it("is a single with one empty track", () => {
    const s = init();
    expect(s.kind).toBe("single");
    expect(s.tracks.map((x) => x.clientId)).toEqual(["t1"]);
    expect(isDirty(s)).toBe(false);
  });
});

describe("kind toggle", () => {
  it("single → album keeps the track as Track 1", () => {
    let s = r(init(), { type: "setTrackTitle", clientId: "t1", title: "Keep" });
    s = r(s, { type: "setKind", kind: "album" });
    expect(s.kind).toBe("album");
    expect(t(s).title).toBe("Keep");
  });

  it("album → single keeps Track 1 and drops the rest + album details", () => {
    let s = album();
    s = r(s, { type: "setAlbumTitle", title: "LP" });
    s = r(s, { type: "setTrackTitle", clientId: "t1", title: "First" });
    s = r(s, { type: "setKind", kind: "single" });
    expect(s.tracks.map((x) => x.title)).toEqual(["First"]);
    expect(s.album).toEqual({ title: "", artists: [] });
  });

  it("asks for confirmation only when album → single would lose something", () => {
    expect(needsKindConfirm(init(), "album")).toBe(false);
    let s = r(init(), { type: "setKind", kind: "album" });
    expect(needsKindConfirm(s, "single")).toBe(false);
    s = r(s, { type: "addTrack", clientId: "t2" });
    expect(needsKindConfirm(s, "single")).toBe(true);
    const titled = r(r(init(), { type: "setKind", kind: "album" }), { type: "setAlbumTitle", title: "LP" });
    expect(needsKindConfirm(titled, "single")).toBe(true);
  });
});

describe("tracks", () => {
  it("adds, moves, and removes tracks", () => {
    let s = album();
    s = r(s, { type: "addTrack", clientId: "t3" });
    s = r(s, { type: "moveTrack", clientId: "t3", dir: -1 });
    expect(s.tracks.map((x) => x.clientId)).toEqual(["t1", "t3", "t2"]);
    s = r(s, { type: "moveTrack", clientId: "t1", dir: -1 }); // already first: no-op
    expect(s.tracks.map((x) => x.clientId)).toEqual(["t1", "t3", "t2"]);
    s = r(s, { type: "removeTrack", clientId: "t3" });
    expect(s.tracks.map((x) => x.clientId)).toEqual(["t1", "t2"]);
  });

  it("never removes the last track", () => {
    const s = r(init(), { type: "removeTrack", clientId: "t1" });
    expect(s.tracks).toHaveLength(1);
  });
});

describe("files and titles", () => {
  it("auto-fills the title from the filename until the user types one", () => {
    let s = r(init(), { type: "setTrackFile", clientId: "t1", file: mp3("NOVA. - SLOW BLOOM.mp3") });
    expect(t(s).title).toBe("NOVA. - SLOW BLOOM");
    s = r(s, { type: "setTrackTitle", clientId: "t1", title: "Slow Bloom" });
    s = r(s, { type: "setTrackFile", clientId: "t1", file: mp3("other_take.mp3") });
    expect(t(s).title).toBe("Slow Bloom");
  });

  it("titleFromFilename strips the extension and underscores", () => {
    expect(titleFromFilename("my_new_song.MP3")).toBe("my new song");
  });

  it("records a file error for non-mp3 and does not auto-fill", () => {
    const s = r(init(), { type: "setTrackFile", clientId: "t1", file: mp3("song.wav") });
    expect(t(s).fileError).toBe("Only MP3 files are supported.");
    expect(t(s).title).toBe("");
  });

  it("replacing a file resets its upload so it will be uploaded again", () => {
    let s = r(init(), { type: "setTrackFile", clientId: "t1", file: mp3() });
    s = r(s, { type: "uploadDone", clientId: "t1", key: "tracks/k.mp3" });
    expect(t(s).upload).toMatchObject({ status: "done", key: "tracks/k.mp3" });
    s = r(s, { type: "setTrackFile", clientId: "t1", file: mp3("new.mp3") });
    expect(t(s).upload).toEqual({ status: "idle", progress: 0, key: null, error: null });
  });
});

describe("artist chips", () => {
  it("adds chips in order, ignores duplicates by id or name, moves and removes", () => {
    let s = r(init(), { type: "addTrackArtist", clientId: "t1", chip: existingChip({ id: "a1", name: "Halcyon" }) });
    s = r(s, { type: "addTrackArtist", clientId: "t1", chip: newChip("Ember") });
    s = r(s, { type: "addTrackArtist", clientId: "t1", chip: newChip(" ember ") });
    s = r(s, { type: "addTrackArtist", clientId: "t1", chip: existingChip({ id: "a1", name: "Halcyon" }) });
    expect(t(s).artists.map((c) => c.name)).toEqual(["Halcyon", "Ember"]);
    s = r(s, { type: "moveTrackArtist", clientId: "t1", key: newChip("Ember").key, dir: -1 });
    expect(t(s).artists.map((c) => c.name)).toEqual(["Ember", "Halcyon"]);
    s = r(s, { type: "removeTrackArtist", clientId: "t1", key: "id:a1" });
    expect(t(s).artists.map((c) => c.name)).toEqual(["Ember"]);
  });

  it("album artists work the same way", () => {
    let s = album();
    s = r(s, { type: "addAlbumArtist", chip: newChip("Lead") });
    s = r(s, { type: "addAlbumArtist", chip: newChip("Two") });
    s = r(s, { type: "moveAlbumArtist", key: newChip("Two").key, dir: -1 });
    expect(s.album.artists.map((c) => c.name)).toEqual(["Two", "Lead"]);
    s = r(s, { type: "removeAlbumArtist", key: newChip("Lead").key });
    expect(s.album.artists.map((c) => c.name)).toEqual(["Two"]);
  });

  it("pendingNewArtists lists each new name once across the whole form", () => {
    let s = album();
    s = r(s, { type: "addAlbumArtist", chip: newChip("Ember") });
    s = r(s, { type: "addTrackArtist", clientId: "t1", chip: newChip(" EMBER") });
    s = r(s, { type: "addTrackArtist", clientId: "t2", chip: newChip("Feat") });
    s = r(s, { type: "addTrackArtist", clientId: "t2", chip: existingChip({ id: "a1", name: "Old" }) });
    expect(pendingNewArtists(s).map((c) => c.name)).toEqual(["Ember", "Feat"]);
  });
});

describe("publishing flags", () => {
  it("publishStarted is a no-op while already publishing", () => {
    const once = r(init(), { type: "publishStarted" });
    expect(once.publishing).toBe(true);
    expect(r(once, { type: "publishStarted" })).toBe(once);
  });

  it("publishFailed stops publishing and shows the error", () => {
    let s = r(init(), { type: "publishStarted" });
    s = r(s, { type: "publishFailed", error: "nope" });
    expect(s).toMatchObject({ publishing: false, formError: "nope" });
  });

  it("tracks upload progress per track", () => {
    let s = r(init(), { type: "uploadStarted", clientId: "t1" });
    s = r(s, { type: "uploadProgress", clientId: "t1", progress: 0.5 });
    expect(t(s).upload).toMatchObject({ status: "uploading", progress: 0.5 });
    s = r(s, { type: "uploadFailed", clientId: "t1", error: "Upload failed." });
    expect(t(s).upload).toMatchObject({ status: "error", error: "Upload failed." });
  });

  it("clear resets to a fresh single", () => {
    let s = album();
    s = r(s, { type: "setAlbumTitle", title: "LP" });
    s = r(s, { type: "clear", clientId: "fresh" });
    expect(s).toEqual(createInitialState("fresh"));
  });
});

describe("validate", () => {
  it("flags every missing field", () => {
    const e = validate(album());
    expect(e.albumTitle).toBe("Album title is required.");
    expect(e.tracks.t1).toEqual({
      file: "Choose an MP3.",
      title: "Title is required.",
      artists: "Add at least one artist.",
    });
    expect(hasErrors(e)).toBe(true);
  });

  it("requires 2 tracks for an album", () => {
    const s = r(init(), { type: "setKind", kind: "album" });
    expect(validate(s).form).toBe("An album needs at least 2 tracks.");
  });

  it("surfaces the file error", () => {
    const s = r(init(), { type: "setTrackFile", clientId: "t1", file: mp3("x.wav") });
    expect(validate(s).tracks.t1.file).toBe("Only MP3 files are supported.");
  });

  it("passes a complete single", () => {
    let s = r(init(), { type: "setTrackFile", clientId: "t1", file: mp3() });
    s = r(s, { type: "addTrackArtist", clientId: "t1", chip: newChip("Nova") });
    expect(hasErrors(validate(s))).toBe(false);
  });
});

describe("buildPayload", () => {
  it("maps chips to refs and uses the uploaded keys, in order", () => {
    let s = album();
    s = r(s, { type: "setAlbumTitle", title: "  Sample Album " });
    s = r(s, { type: "addAlbumArtist", chip: existingChip({ id: "a1", name: "Halcyon" }) });
    s = r(s, { type: "setTrackTitle", clientId: "t1", title: "FIRST LIGHT" });
    s = r(s, { type: "addTrackArtist", clientId: "t1", chip: newChip(" Ember ") });
    s = r(s, { type: "setTrackTitle", clientId: "t2", title: "NIGHT SHIFT" });
    s = r(s, { type: "addTrackArtist", clientId: "t2", chip: existingChip({ id: "a2", name: "Juno Park" }) });

    expect(buildPayload(s, { t1: "tracks/1.mp3", t2: "tracks/2.mp3" })).toEqual({
      kind: "album",
      album: { title: "Sample Album", artists: [{ id: "a1" }] },
      tracks: [
        { title: "FIRST LIGHT", audioKey: "tracks/1.mp3", artists: [{ newName: "Ember" }] },
        { title: "NIGHT SHIFT", audioKey: "tracks/2.mp3", artists: [{ id: "a2" }] },
      ],
    });
  });

  it("omits album for a single and throws when a key is missing", () => {
    let s = r(init(), { type: "setTrackTitle", clientId: "t1", title: "Solo" });
    s = r(s, { type: "addTrackArtist", clientId: "t1", chip: newChip("Nova") });
    expect(buildPayload(s, { t1: "tracks/1.mp3" })).not.toHaveProperty("album");
    expect(() => buildPayload(s, {})).toThrow("Track 1 has no uploaded file.");
  });
});

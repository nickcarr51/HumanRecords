// All state for the /admin/upload form. Pure: ids for new tracks come in on
// the action so the reducer never generates randomness itself.

import type { ArtistMatch, ArtistRef, ReleaseKind, ReleasePayload } from "@/lib/admin/types";
import { MIN_ALBUM_TRACKS, audioFileError } from "@/lib/admin/rules";

export type ArtistChip = { key: string; id: string | null; name: string };
export type UploadStatus = "idle" | "uploading" | "done" | "error";
export type TrackDraft = {
  clientId: string;
  title: string;
  titleTouched: boolean;
  file: File | null;
  fileError: string | null;
  artists: ArtistChip[];
  upload: { status: UploadStatus; progress: number; key: string | null; error: string | null };
};
export type UploadState = {
  kind: ReleaseKind;
  album: { title: string; artists: ArtistChip[] };
  tracks: TrackDraft[];
  publishing: boolean;
  formError: string | null;
  showErrors: boolean;
};
export type Direction = -1 | 1;

export type UploadAction =
  | { type: "setKind"; kind: ReleaseKind }
  | { type: "setAlbumTitle"; title: string }
  | { type: "addAlbumArtist"; chip: ArtistChip }
  | { type: "removeAlbumArtist"; key: string }
  | { type: "moveAlbumArtist"; key: string; dir: Direction }
  | { type: "addTrack"; clientId: string }
  | { type: "removeTrack"; clientId: string }
  | { type: "moveTrack"; clientId: string; dir: Direction }
  | { type: "setTrackTitle"; clientId: string; title: string }
  | { type: "setTrackFile"; clientId: string; file: File | null }
  | { type: "addTrackArtist"; clientId: string; chip: ArtistChip }
  | { type: "removeTrackArtist"; clientId: string; key: string }
  | { type: "moveTrackArtist"; clientId: string; key: string; dir: Direction }
  | { type: "uploadStarted"; clientId: string }
  | { type: "uploadProgress"; clientId: string; progress: number }
  | { type: "uploadDone"; clientId: string; key: string }
  | { type: "uploadFailed"; clientId: string; error: string }
  | { type: "publishStarted" }
  | { type: "publishFailed"; error: string }
  | { type: "showErrors" }
  | { type: "clear"; clientId: string };

export type TrackErrors = { file?: string; title?: string; artists?: string };
export type ValidationErrors = { albumTitle?: string; form?: string; tracks: Record<string, TrackErrors> };

// Mirrors the DB's lower(trim(name)) uniqueness rule.
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
export function existingChip(match: ArtistMatch): ArtistChip {
  return { key: `id:${match.id}`, id: match.id, name: match.name };
}
export function newChip(name: string): ArtistChip {
  return { key: `new:${normalizeName(name)}`, id: null, name: name.trim() };
}

const IDLE_UPLOAD: TrackDraft["upload"] = { status: "idle", progress: 0, key: null, error: null };

function emptyTrack(clientId: string): TrackDraft {
  return {
    clientId,
    title: "",
    titleTouched: false,
    file: null,
    fileError: null,
    artists: [],
    upload: IDLE_UPLOAD,
  };
}

export function createInitialState(clientId: string): UploadState {
  return {
    kind: "single",
    album: { title: "", artists: [] },
    tracks: [emptyTrack(clientId)],
    publishing: false,
    formError: null,
    showErrors: false,
  };
}

export function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
}

function move<T>(list: T[], index: number, dir: Direction): T[] {
  const to = index + dir;
  if (index < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

function addChip(list: ArtistChip[], chip: ArtistChip): ArtistChip[] {
  const dup = list.some((c) => c.key === chip.key || normalizeName(c.name) === normalizeName(chip.name));
  return dup ? list : [...list, chip];
}

function moveChip(list: ArtistChip[], key: string, dir: Direction): ArtistChip[] {
  return move(list, list.findIndex((c) => c.key === key), dir);
}

function updateTrack(state: UploadState, clientId: string, fn: (t: TrackDraft) => TrackDraft): UploadState {
  return { ...state, tracks: state.tracks.map((t) => (t.clientId === clientId ? fn(t) : t)) };
}

export function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case "setKind":
      if (action.kind === state.kind) return state;
      if (action.kind === "album") return { ...state, kind: "album" };
      return { ...state, kind: "single", tracks: state.tracks.slice(0, 1), album: { title: "", artists: [] } };

    case "setAlbumTitle":
      return { ...state, album: { ...state.album, title: action.title } };
    case "addAlbumArtist":
      return { ...state, album: { ...state.album, artists: addChip(state.album.artists, action.chip) } };
    case "removeAlbumArtist":
      return { ...state, album: { ...state.album, artists: state.album.artists.filter((c) => c.key !== action.key) } };
    case "moveAlbumArtist":
      return { ...state, album: { ...state.album, artists: moveChip(state.album.artists, action.key, action.dir) } };

    case "addTrack":
      return { ...state, tracks: [...state.tracks, emptyTrack(action.clientId)] };
    case "removeTrack":
      if (state.tracks.length <= 1) return state;
      return { ...state, tracks: state.tracks.filter((t) => t.clientId !== action.clientId) };
    case "moveTrack":
      return { ...state, tracks: move(state.tracks, state.tracks.findIndex((t) => t.clientId === action.clientId), action.dir) };

    case "setTrackTitle":
      return updateTrack(state, action.clientId, (t) => ({
        ...t,
        title: action.title,
        titleTouched: action.title.trim() !== "",
      }));
    case "setTrackFile":
      return updateTrack(state, action.clientId, (t) => {
        const fileError = action.file ? audioFileError(action.file) : null;
        const autoTitle = !t.titleTouched && action.file && !fileError ? titleFromFilename(action.file.name) : t.title;
        return { ...t, file: action.file, fileError, title: autoTitle, upload: IDLE_UPLOAD };
      });
    case "addTrackArtist":
      return updateTrack(state, action.clientId, (t) => ({ ...t, artists: addChip(t.artists, action.chip) }));
    case "removeTrackArtist":
      return updateTrack(state, action.clientId, (t) => ({ ...t, artists: t.artists.filter((c) => c.key !== action.key) }));
    case "moveTrackArtist":
      return updateTrack(state, action.clientId, (t) => ({ ...t, artists: moveChip(t.artists, action.key, action.dir) }));

    case "uploadStarted":
      return updateTrack(state, action.clientId, (t) => ({ ...t, upload: { status: "uploading", progress: 0, key: null, error: null } }));
    case "uploadProgress":
      return updateTrack(state, action.clientId, (t) => ({ ...t, upload: { ...t.upload, progress: action.progress } }));
    case "uploadDone":
      return updateTrack(state, action.clientId, (t) => ({ ...t, upload: { status: "done", progress: 1, key: action.key, error: null } }));
    case "uploadFailed":
      return updateTrack(state, action.clientId, (t) => ({ ...t, upload: { ...t.upload, status: "error", error: action.error } }));

    case "publishStarted":
      if (state.publishing) return state;
      return { ...state, publishing: true, formError: null, showErrors: true };
    case "publishFailed":
      return { ...state, publishing: false, formError: action.error };
    case "showErrors":
      return { ...state, showErrors: true };
    case "clear":
      return createInitialState(action.clientId);
  }
}

export function needsKindConfirm(state: UploadState, kind: ReleaseKind): boolean {
  if (!(state.kind === "album" && kind === "single")) return false;
  return state.tracks.length > 1 || state.album.title.trim() !== "" || state.album.artists.length > 0;
}

export function isDirty(state: UploadState): boolean {
  return (
    state.album.title.trim() !== "" ||
    state.album.artists.length > 0 ||
    state.tracks.length > 1 ||
    state.tracks.some((t) => t.title.trim() !== "" || t.file !== null || t.artists.length > 0)
  );
}

export function pendingNewArtists(state: UploadState): ArtistChip[] {
  const seen = new Map<string, ArtistChip>();
  for (const chip of [...state.album.artists, ...state.tracks.flatMap((t) => t.artists)]) {
    if (chip.id === null && !seen.has(chip.key)) seen.set(chip.key, chip);
  }
  return [...seen.values()];
}

export function validate(state: UploadState): ValidationErrors {
  const errors: ValidationErrors = { tracks: {} };
  if (state.kind === "album") {
    if (!state.album.title.trim()) errors.albumTitle = "Album title is required.";
    if (state.tracks.length < MIN_ALBUM_TRACKS) errors.form = "An album needs at least 2 tracks.";
  }
  for (const t of state.tracks) {
    const e: TrackErrors = {};
    if (!t.file) e.file = "Choose an MP3.";
    else if (t.fileError) e.file = t.fileError;
    if (!t.title.trim()) e.title = "Title is required.";
    if (t.artists.length === 0) e.artists = "Add at least one artist.";
    if (Object.keys(e).length) errors.tracks[t.clientId] = e;
  }
  return errors;
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Boolean(errors.albumTitle || errors.form || Object.keys(errors.tracks).length);
}

function toRef(chip: ArtistChip): ArtistRef {
  return chip.id ? { id: chip.id } : { newName: chip.name.trim() };
}

export function buildPayload(state: UploadState, keys: Record<string, string>): ReleasePayload {
  const tracks = state.tracks.map((t, i) => {
    const audioKey = keys[t.clientId];
    if (!audioKey) throw new Error(`Track ${i + 1} has no uploaded file.`);
    return { title: t.title.trim(), audioKey, artists: t.artists.map(toRef) };
  });
  if (state.kind === "single") return { kind: "single", tracks };
  return {
    kind: "album",
    album: { title: state.album.title.trim(), artists: state.album.artists.map(toRef) },
    tracks,
  };
}

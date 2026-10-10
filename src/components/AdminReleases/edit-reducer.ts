// Draft state for /admin/releases/[id]: titles, artists, and track order,
// committed together by saveRelease. Only live tracks are in the draft;
// removed tracks are managed by instant actions outside it.

import type { AdminRelease } from '@/lib/admin/releases';
import type { ReleaseEditPayload } from '@/lib/admin/types';
import { addChip, existingChip, move, moveChip, toRef, type ArtistChip, type Direction } from '../Upload/upload-reducer';

export type DraftTrack = { id: string; title: string; artists: ArtistChip[] };
export type EditState = {
  album: { title: string; artists: ArtistChip[] } | null;
  tracks: DraftTrack[];
  showErrors: boolean;
};
export type EditAction =
  | { type: 'reset'; release: AdminRelease }
  | { type: 'setAlbumTitle'; title: string }
  | { type: 'addAlbumArtist'; chip: ArtistChip }
  | { type: 'removeAlbumArtist'; key: string }
  | { type: 'moveAlbumArtist'; key: string; dir: Direction }
  | { type: 'setTrackTitle'; id: string; title: string }
  | { type: 'addTrackArtist'; id: string; chip: ArtistChip }
  | { type: 'removeTrackArtist'; id: string; key: string }
  | { type: 'moveTrackArtist'; id: string; key: string; dir: Direction }
  | { type: 'moveTrack'; id: string; dir: Direction }
  | { type: 'showErrors' };
export type DraftErrors = { albumTitle?: string; tracks: Record<string, { title?: string; artists?: string }> };

export function draftFrom(release: AdminRelease): EditState {
  return {
    album: release.album ? { title: release.album.title, artists: release.album.artists.map(existingChip) } : null,
    tracks: release.tracks
      .filter((t) => !t.archived)
      .map((t) => ({ id: t.id, title: t.title, artists: t.artists.map(existingChip) })),
    showErrors: false,
  };
}

function updateTrack(state: EditState, id: string, fn: (t: DraftTrack) => DraftTrack): EditState {
  return { ...state, tracks: state.tracks.map((t) => (t.id === id ? fn(t) : t)) };
}

function updateAlbum(state: EditState, fn: (a: NonNullable<EditState['album']>) => NonNullable<EditState['album']>): EditState {
  return state.album ? { ...state, album: fn(state.album) } : state;
}

export function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case 'reset':
      return draftFrom(action.release);
    case 'setAlbumTitle':
      return updateAlbum(state, (a) => ({ ...a, title: action.title }));
    case 'addAlbumArtist':
      return updateAlbum(state, (a) => ({ ...a, artists: addChip(a.artists, action.chip) }));
    case 'removeAlbumArtist':
      return updateAlbum(state, (a) => ({ ...a, artists: a.artists.filter((c) => c.key !== action.key) }));
    case 'moveAlbumArtist':
      return updateAlbum(state, (a) => ({ ...a, artists: moveChip(a.artists, action.key, action.dir) }));
    case 'setTrackTitle':
      return updateTrack(state, action.id, (t) => ({ ...t, title: action.title }));
    case 'addTrackArtist':
      return updateTrack(state, action.id, (t) => ({ ...t, artists: addChip(t.artists, action.chip) }));
    case 'removeTrackArtist':
      return updateTrack(state, action.id, (t) => ({ ...t, artists: t.artists.filter((c) => c.key !== action.key) }));
    case 'moveTrackArtist':
      return updateTrack(state, action.id, (t) => ({ ...t, artists: moveChip(t.artists, action.key, action.dir) }));
    case 'moveTrack':
      return { ...state, tracks: move(state.tracks, state.tracks.findIndex((t) => t.id === action.id), action.dir) };
    case 'showErrors':
      return { ...state, showErrors: true };
  }
}

function snapshot(s: EditState): string {
  return JSON.stringify({
    album: s.album && { title: s.album.title, artists: s.album.artists.map((c) => c.key) },
    tracks: s.tracks.map((t) => ({ id: t.id, title: t.title, artists: t.artists.map((c) => c.key) })),
  });
}

export function isDraftDirty(state: EditState, release: AdminRelease): boolean {
  return snapshot(state) !== snapshot(draftFrom(release));
}

export function validateDraft(state: EditState): DraftErrors {
  const errors: DraftErrors = { tracks: {} };
  if (state.album && !state.album.title.trim()) errors.albumTitle = 'Album title is required.';
  for (const t of state.tracks) {
    const e: { title?: string; artists?: string } = {};
    if (!t.title.trim()) e.title = 'Title is required.';
    if (t.artists.length === 0) e.artists = 'Add at least one artist.';
    if (Object.keys(e).length) errors.tracks[t.id] = e;
  }
  return errors;
}

export function hasDraftErrors(errors: DraftErrors): boolean {
  return Boolean(errors.albumTitle) || Object.keys(errors.tracks).length > 0;
}

// New (not yet created) artist chips anywhere in the draft, so every
// combobox can offer them.
export function pendingInDraft(state: EditState): ArtistChip[] {
  const seen = new Map<string, ArtistChip>();
  for (const chip of [...(state.album?.artists ?? []), ...state.tracks.flatMap((t) => t.artists)]) {
    if (chip.id === null && !seen.has(chip.key)) seen.set(chip.key, chip);
  }
  return [...seen.values()];
}

export function buildEditPayload(state: EditState): ReleaseEditPayload {
  const tracks = state.tracks.map((t) => ({ id: t.id, title: t.title.trim(), artists: t.artists.map(toRef) }));
  if (!state.album) return { tracks };
  return { album: { title: state.album.title.trim(), artists: state.album.artists.map(toRef) }, tracks };
}

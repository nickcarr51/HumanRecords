// Client-safe types shared by the upload form and the admin server actions.
// ReleasePayload is also the shape next branch's edit flow will send.

export type ReleaseKind = "single" | "album";
export type ArtistRef = { id: string } | { newName: string };
export type ReleasePayload = {
  kind: ReleaseKind;
  album?: { title: string; artists: ArtistRef[] };
  tracks: Array<{ title: string; audioKey: string; artists: ArtistRef[] }>;
};
export type ArtistMatch = { id: string; name: string };
export type ArtistSearchResult = { artists: ArtistMatch[]; error: string | null };
export type UploadRequest = { clientId: string; name: string; size: number };
export type UploadTarget = { clientId: string; key: string; url: string };
export type UploadUrlsResult =
  | { targets: UploadTarget[]; error: null }
  | { targets: null; error: string };
export type PublishResult = { error: string };

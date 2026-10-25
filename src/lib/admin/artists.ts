import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { escapeLike } from "@/lib/supabase/artists";
import { listUsers as listAllUsers } from "@/lib/services/users";
import { getViewer } from "@/lib/services/viewer";
import {
  ADMIN_ARTISTS_PAGE_SIZE,
  LINKABLE_USERS_LIMIT,
  type AdminArtistDetail,
  type AdminArtistRow,
  type AdminArtistsPage,
  type LinkableUser,
  type LinkedUser,
} from "./artists-types";

// Reads for /admin/artists. Pass the cookie-bound server client: artists are
// readable by any signed-in user, and the users service checks the caller's
// role.

type Db = SupabaseClient<Database>;
export type LinkTargets = { users: LinkedUser[]; links: Array<{ id: string; name: string; userId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUERY_LENGTH = 100;
const ROW_SELECT = "id, name, bio, created_at, user_id, track_artists(count), album_artists(count)";

type RawRow = {
  id: string;
  name: string;
  bio: string | null;
  created_at: string;
  user_id: string | null;
  track_artists: unknown;
  album_artists: unknown;
};

function countOf(rel: unknown): number {
  return (rel as Array<{ count: number }> | null)?.[0]?.count ?? 0;
}

async function listUsers(db: Db): Promise<LinkedUser[]> {
  const rows = await listAllUsers(await getViewer(db));
  return rows.map((u) => ({ id: u.id, name: u.name, email: u.email }));
}

function toRow(r: RawRow, users: Map<string, LinkedUser>): AdminArtistRow {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    trackCount: countOf(r.track_artists),
    albumCount: countOf(r.album_artists),
    linkedUser: r.user_id ? (users.get(r.user_id) ?? null) : null,
  };
}

export async function listAdminArtists(
  db: Db,
  opts: { query?: string; page?: number } = {},
): Promise<AdminArtistsPage> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = ADMIN_ARTISTS_PAGE_SIZE;
  const query = (opts.query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const from = (page - 1) * pageSize;

  const matches = (q: ReturnType<Db["from"]>) => (query ? q.ilike("name", `%${escapeLike(query)}%`) : q);
  const builder = matches(
    db
      .from("artists")
      .select(ROW_SELECT, { count: "exact" })
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1),
  );

  const [{ data, error, count }, users] = await Promise.all([builder, listUsers(db)]);
  if (error) {
    // PostgREST answers a range past the last row with 416 / PGRST103. Return
    // the true total so the caller can clamp to the last real page.
    if (error.code !== "PGRST103") throw error;
    const head = await matches(db.from("artists").select("id", { count: "exact", head: true }));
    if (head.error) throw head.error;
    return { artists: [], total: head.count ?? 0, page, pageSize };
  }
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    artists: ((data ?? []) as unknown as RawRow[]).map((r) => toRow(r, byId)),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getAdminArtist(db: Db, id: string): Promise<AdminArtistDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const [{ data, error }, users] = await Promise.all([
    db.from("artists").select(ROW_SELECT).eq("id", id).maybeSingle(),
    listUsers(db),
  ]);
  if (error) throw error;
  if (!data) return null;
  const raw = data as unknown as RawRow;
  return { ...toRow(raw, new Map(users.map((u) => [u.id, u]))), bio: raw.bio };
}

// Every credit counts (archived tracks too): the FK restrict blocks on all of them.
export async function getCreditCounts(db: Db, id: string): Promise<{ tracks: number; albums: number }> {
  const [t, a] = await Promise.all([
    db.from("track_artists").select("artist_id", { count: "exact", head: true }).eq("artist_id", id),
    db.from("album_artists").select("artist_id", { count: "exact", head: true }).eq("artist_id", id),
  ]);
  if (t.error) throw t.error;
  if (a.error) throw a.error;
  return { tracks: t.count ?? 0, albums: a.count ?? 0 };
}

export async function loadLinkTargets(db: Db): Promise<LinkTargets> {
  const [users, { data, error }] = await Promise.all([
    listUsers(db),
    db.from("artists").select("id, name, user_id").not("user_id", "is", null),
  ]);
  if (error) throw error;
  return {
    users,
    links: (data ?? []).map((a) => ({ id: a.id, name: a.name, userId: a.user_id as string })),
  };
}

// Users matching `query` by name or email. A user linked to a *different*
// artist carries linkedArtist so the picker can show it disabled.
export function filterLinkableUsers(targets: LinkTargets, query: string, artistId: string | undefined): LinkableUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const linkByUser = new Map(targets.links.map((l) => [l.userId, l]));
  return targets.users
    .filter((u) => (u.name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    .slice(0, LINKABLE_USERS_LIMIT)
    .map((u) => {
      const link = linkByUser.get(u.id);
      return { ...u, linkedArtist: link && link.id !== artistId ? { id: link.id, name: link.name } : null };
    });
}

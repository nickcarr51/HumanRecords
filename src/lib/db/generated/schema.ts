import { boolean, check, foreignKey, index, integer, pgEnum, pgPolicy, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const releaseKind = pgEnum("release_kind", ['single', 'album'])
export const userRole = pgEnum("user_role", ['listener', 'artist', 'label_member'])


export const albumArtists = pgTable("album_artists", {
	albumId: uuid("album_id").notNull(),
	artistId: uuid("artist_id").notNull(),
	position: integer().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.albumId],
			foreignColumns: [albums.id],
			name: "album_artists_album_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.artistId],
			foreignColumns: [artists.id],
			name: "album_artists_artist_id_fkey"
		}).onDelete("restrict"),
	index("album_artists_artist_id_idx").using("btree", table.artistId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("authenticated users can read album_artists", { as: "permissive", for: "select", to: ["authenticated"] }),
	primaryKey({ columns: [table.albumId, table.artistId], name: "album_artists_pkey"}),
]);

export const albums = pgTable("albums", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	albumArtUrl: text("album_art_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	catalogNumber: integer("catalog_number").generatedAlwaysAsIdentity({ name: "albums_catalog_number_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
}, (table) => [
	pgPolicy("authenticated users can read albums", { as: "permissive", for: "select", to: ["authenticated"] }),
	unique("albums_catalog_number_key").on(table.catalogNumber),
]);

export const artists = pgTable("artists", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	bio: text(),
	profilePhotoUrl: text("profile_photo_url"),
	userId: uuid("user_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "artists_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("authenticated users can read artists", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("label members insert artists", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("label members update artists", { as: "permissive", for: "update", to: ["authenticated"] }),
	unique("artists_user_id_key").on(table.userId),
	uniqueIndex("artists_name_ci_key").using("btree", sql`lower(TRIM(BOTH FROM name))`),
]);

export const downloads = pgTable("downloads", {
	userId: uuid("user_id").notNull(),
	trackId: uuid("track_id").notNull(),
	downloadedAt: timestamp("downloaded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.trackId],
			foreignColumns: [tracks.id],
			name: "downloads_track_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "downloads_user_id_fkey"
		}).onDelete("cascade"),
	index("downloads_track_id_idx").using("btree", table.trackId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("users can read their own downloads", { as: "permissive", for: "select", to: ["authenticated"] }),
	primaryKey({ columns: [table.trackId, table.userId], name: "downloads_pkey"}),
]);

export const invites = pgTable("invites", {
	userId: uuid("user_id").primaryKey().notNull(),
	token: text(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "invites_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "invites_user_id_fkey"
		}).onDelete("cascade"),
	unique("invites_token_key").on(table.token),
]);

export const r2CleanupQueue = pgTable("r2_cleanup_queue", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	objectKey: text("object_key").notNull(),
	reason: text().notNull(),
	sourceTable: text("source_table").notNull(),
	sourceId: uuid("source_id").notNull(),
	queuedAt: timestamp("queued_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	cleanedAt: timestamp("cleaned_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	check("r2_cleanup_queue_reason_check", sql`reason = ANY (ARRAY['archived'::text, 'replaced'::text])`),
	check("r2_cleanup_queue_source_table_check", sql`source_table = ANY (ARRAY['tracks'::text, 'albums'::text, 'artists'::text])`),
	index("r2_cleanup_queue_pending_idx").using("btree", table.queuedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(cleaned_at IS NULL)`),
	index("r2_cleanup_queue_source_idx").using("btree", table.sourceTable.asc().nullsLast().op("text_ops"), table.sourceId.asc().nullsLast().op("text_ops")),
]);

export const releases = pgTable("releases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	kind: releaseKind().notNull(),
	trackId: uuid("track_id"),
	albumId: uuid("album_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	pinned: boolean().default(false).notNull(),
	sortAt: timestamp("sort_at", { withTimezone: true, mode: 'string' }).notNull(),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	check("releases_kind_matches_target", sql`((kind = 'single'::release_kind) AND (track_id IS NOT NULL) AND (album_id IS NULL)) OR ((kind = 'album'::release_kind) AND (album_id IS NOT NULL) AND (track_id IS NULL))`),
	foreignKey({
			columns: [table.albumId],
			foreignColumns: [albums.id],
			name: "releases_album_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.trackId],
			foreignColumns: [tracks.id],
			name: "releases_track_id_fkey"
		}).onDelete("cascade"),
	index("releases_created_at_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("releases_feed_order_idx").using("btree", table.pinned.desc().nullsFirst().op("bool_ops"), table.sortAt.desc().nullsFirst().op("timestamptz_ops"), table.id.desc().nullsFirst().op("uuid_ops")).where(sql`(archived_at IS NULL)`),
	pgPolicy("signed-in users read live releases; label members read all", { as: "permissive", for: "select", to: ["authenticated"] }),
	unique("releases_album_id_key").on(table.albumId),
	unique("releases_track_id_key").on(table.trackId),
]);

export const trackAlbums = pgTable("track_albums", {
	trackId: uuid("track_id").notNull(),
	albumId: uuid("album_id").notNull(),
	position: integer().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.albumId],
			foreignColumns: [albums.id],
			name: "track_albums_album_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.trackId],
			foreignColumns: [tracks.id],
			name: "track_albums_track_id_fkey"
		}).onDelete("cascade"),
	index("track_albums_album_id_idx").using("btree", table.albumId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("authenticated users can read track_albums", { as: "permissive", for: "select", to: ["authenticated"] }),
	primaryKey({ columns: [table.albumId, table.trackId], name: "track_albums_pkey"}),
]);

export const trackArtists = pgTable("track_artists", {
	trackId: uuid("track_id").notNull(),
	artistId: uuid("artist_id").notNull(),
	position: integer().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.artistId],
			foreignColumns: [artists.id],
			name: "track_artists_artist_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.trackId],
			foreignColumns: [tracks.id],
			name: "track_artists_track_id_fkey"
		}).onDelete("cascade"),
	index("track_artists_artist_id_idx").using("btree", table.artistId.asc().nullsLast().op("uuid_ops")),
	pgPolicy("authenticated users can read track_artists", { as: "permissive", for: "select", to: ["authenticated"] }),
	primaryKey({ columns: [table.artistId, table.trackId], name: "track_artists_pkey"}),
]);

export const tracks = pgTable("tracks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	trackArtUrl: text("track_art_url"),
	audioUrl: text("audio_url").notNull(),
	playCount: integer("play_count").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
	catalogNumber: integer("catalog_number").generatedAlwaysAsIdentity({ name: "tracks_catalog_number_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
}, (table) => [
	pgPolicy("signed-in users read live tracks; label members read all", { as: "permissive", for: "select", to: ["authenticated"] }),
	unique("tracks_catalog_number_key").on(table.catalogNumber),
]);

export const users = pgTable("users", {
	id: uuid().primaryKey().notNull(),
	role: userRole().default('listener').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	name: text(),
}, (table) => [
	foreignKey({
			columns: [table.id],
			foreignColumns: [table.id],
			name: "users_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("authenticated users can read users", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

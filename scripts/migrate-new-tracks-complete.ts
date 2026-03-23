import { Client } from "pg";
import { Sequelize } from "sequelize-typescript";
import {
  TrackArtistMappingModel,
  ArtistModel,
} from "../services/persistence-service/artists/modules.export";
import { FilterModel } from "../services/persistence-service/filter/modules.export";
import { SkuModel } from "../services/persistence-service/sku/modules.export";
import { OwnerModel } from "../services/persistence-service/owner/modules.export";
import { AlbumModel } from "../services/persistence-service/albums/schemas/album.schema";
import { TrackModel } from "../services/persistence-service/track/modules.export";
import { TrackFilterMappingModel } from "../services/persistence-service/filter/modules.export";
import { ArtistType } from "../services/dto-service/modules.export";

// ============ SOURCE DATABASE ============
const SOURCE_DB_CONFIG = {
  host: "34.100.172.44",
  port: 5432,
  user: "s-prod",
  password: "ROUG2gact4whif_oorn",
  database: "S-PROD",
};

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.153.109",
  user: process.env.DB_USER || "unified-prod",
  password: process.env.DB_PASSWORD || 'X"E6o+`{yvN|c30R',
  database: process.env.DB_NAME || "unified-backend-prod",
  port: parseInt(process.env.DB_PORT || "5432"),
  ssl: { rejectUnauthorized: false },
  // host: "34.47.200.207",
  // port: 5432,
  // user: "select-server-dev",
  // password: "hO82GcLotttB5bLyoeG1",
  // database: "sage_staging",
};

// ============ HELPER FUNCTIONS ============

function toStringArray(value: string | null | any[]): string[] | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value.filter((v) => v && String(v).trim());
  }

  if (typeof value === "string") {
    if (value.startsWith("{") && value.endsWith("}")) {
      return value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/"/g, ""))
        .filter(Boolean);
    }
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return null;
}

function toBoolean(value: string | null): boolean | null {
  if (value === null || value === undefined) return null;
  if (value === "Y" || value === "y") return true;
  if (value === "N" || value === "n") return false;
  return null;
}

function toJsonbStrict(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      trimmed === "" ||
      trimmed === "{" ||
      trimmed === "[" ||
      trimmed.endsWith(":") ||
      trimmed.endsWith(",")
    ) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return { raw: trimmed };
    }
  }
  return null;
}

// ============ TRACK FIELD MAPPING ============

const TRACK_MODEL_FIELDS = [
  "id",
  "trackCode",
  "type",
  "name",
  "description",
  "duration",
  "size",
  "bpm",
  "songKey",
  "timeSignature",
  "region",
  "releaseRegion",
  "releaseDate",
  "ownerId",
  "hasVocals",
  "isPRO",
  "displayTags",
  "sourceLink",
  "name_slug",
  "waveformLink",
  "mp3Link",
  "ISRC",
  "lyrics",
  "tier",
  "energy",
  "industry",
  "status",
  "createdAt",
  "updatedAt",
  "publisherId",
  "trending",
  "premium",
  "reelCount",
  "partnerId",
  "bollywood",
] as const;

// Fields stored as PostgreSQL arrays
const TRACK_ARRAY_FIELDS = ["songKey", "displayTags", "ownerId", "publisherId"];
// Fields stored as JSONB
const TRACK_JSONB_FIELDS = ["industry"];
// Fields that are Y/N booleans in source
const TRACK_BOOLEAN_FIELDS = ["trending", "hasVocals", "isPRO"];
// Fields that need rounding to integer
const TRACK_INTEGER_FIELDS = ["duration", "size"];

function mapSourceTrackToModel(sourceTrack: any): Record<string, any> {
  const mapped: Record<string, any> = {};

  for (const field of TRACK_MODEL_FIELDS) {
    const value = sourceTrack[field];
    if (value === undefined) continue;

    if (TRACK_ARRAY_FIELDS.includes(field)) {
      mapped[field] = toStringArray(value);
      continue;
    }
    if (TRACK_JSONB_FIELDS.includes(field)) {
      mapped[field] = toJsonbStrict(value);
      continue;
    }
    if (TRACK_BOOLEAN_FIELDS.includes(field)) {
      mapped[field] = toBoolean(value);
      continue;
    }
    if (TRACK_INTEGER_FIELDS.includes(field)) {
      if (value === null || value === undefined) {
        mapped[field] = null;
      } else {
        const num = parseFloat(value);
        mapped[field] = isNaN(num) ? null : Math.round(num);
      }
      continue;
    }

    mapped[field] = value;
  }

  return mapped;
}

// ============ ARTIST FIELD MAPPING ============

const ARTIST_MODEL_FIELDS = [
  "id",
  "name",
  "artistCode",
  "type",
  "originRegion",
  "name_slug",
  "instagramLink",
  "spotifyLink",
  "status",
  "createdAt",
  "updatedAt",
] as const;

function mapSourceArtistToModel(sourceArtist: any): Record<string, any> {
  const mapped: Record<string, any> = {};
  for (const field of ARTIST_MODEL_FIELDS) {
    const value = sourceArtist[field];
    if (value === undefined) continue;
    mapped[field] = field === "type" ? toStringArray(value) : value;
  }
  return mapped;
}

// ============ ALBUM FIELD MAPPING ============

const ALBUM_MODEL_FIELDS = [
  "id",
  "title",
  "type",
  "artistId",
  "deleted",
  "createdAt",
  "updatedAt",
] as const;

function mapSourceAlbumToModel(
  sourceAlbum: any,
  trackIds: string[],
): Record<string, any> {
  const mapped: Record<string, any> = {};
  for (const field of ALBUM_MODEL_FIELDS) {
    const value = sourceAlbum[field];
    if (value === undefined) continue;
    mapped[field] = value;
  }
  mapped["trackId"] = trackIds.length > 0 ? trackIds : null;
  return mapped;
}

// ============ RAW SQL UPSERT BUILDER (bypasses Sequelize validation) ============

function buildUpsert(
  table: string,
  data: Record<string, any>,
  conflictCol: string,
): { sql: string; values: any[] } {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const cols = keys.map((k) => `"${k}"`).join(", ");
  const params = keys.map((_, i) => `$${i + 1}`).join(", ");
  const updates = keys
    .filter((k) => k !== conflictCol)
    .map((k) => `"${k}" = EXCLUDED."${k}"`)
    .join(", ");
  return {
    sql: `INSERT INTO "${table}" (${cols}) VALUES (${params}) ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updates}`,
    values,
  };
}

// ============ STATS ============

interface MigrationStats {
  artists: { success: number; failed: number };
  owners: { success: number; failed: number };
  filters: { success: number; failed: number };
  albums: { success: number; failed: number };
  tracks: { success: number; failed: number };
  trackArtistMappings: { success: number; failed: number };
  trackFilterMappings: { success: number; failed: number };
}

const stats: MigrationStats = {
  artists: { success: 0, failed: 0 },
  owners: { success: 0, failed: 0 },
  filters: { success: 0, failed: 0 },
  albums: { success: 0, failed: 0 },
  tracks: { success: 0, failed: 0 },
  trackArtistMappings: { success: 0, failed: 0 },
  trackFilterMappings: { success: 0, failed: 0 },
};

// ============ MIGRATION FUNCTIONS ============

async function migrateNewData(
  sourceClient: Client,
  targetClient: Client,
) {
  console.log("\n🚀 Starting incremental migration of new data only...\n");

  const getLastMigratedTime = async (
    tableName: string,
  ): Promise<Date | null> => {
    try {
      const result = await targetClient.query(
        `SELECT MAX("createdAt") as last_created_at FROM "${tableName}"`,
      );
      const timestamp = result.rows[0]?.last_created_at;
      return timestamp ? new Date(timestamp) : null;
    } catch {
      return null;
    }
  };

  // ============ 1. MIGRATE OWNERS ============
  console.log("\n📦 Step 1: Migrating new owners...");
  try {
    const lastOwnerTime = await getLastMigratedTime("owners");

    const { rows: owners } = lastOwnerTime
      ? await sourceClient.query(
          `SELECT * FROM owners WHERE "createdAt" > $1 ORDER BY "createdAt"`,
          [lastOwnerTime],
        )
      : await sourceClient.query(`SELECT * FROM owners ORDER BY "createdAt"`);

    console.log(`✅ Found ${owners.length} new owners to migrate`);

    for (const owner of owners) {
      try {
        await OwnerModel.upsert(owner as any, { conflictFields: ["id"] });
        stats.owners.success++;
      } catch (err) {
        stats.owners.failed++;
        console.error(
          `❌ Failed to migrate owner ${owner.id}:`,
          (err as Error).message,
        );
      }
    }
  } catch (err) {
    console.error("❌ Error migrating owners:", (err as Error).message);
  }

  // ============ 2. MIGRATE ARTISTS ============
  console.log("\n📦 Step 2: Migrating new artists...");
  try {
    const lastArtistTime = await getLastMigratedTime("artists");

    const { rows: artists } = lastArtistTime
      ? await sourceClient.query(
          `SELECT * FROM artists WHERE "createdAt" > $1 ORDER BY "createdAt"`,
          [lastArtistTime],
        )
      : await sourceClient.query(`SELECT * FROM artists ORDER BY "createdAt"`);

    console.log(`✅ Found ${artists.length} new artists to migrate`);

    for (const artist of artists) {
      try {
        if (!artist.id) continue;
        const mapped = mapSourceArtistToModel(artist);
        await ArtistModel.upsert(mapped as any, { conflictFields: ["id"] });
        stats.artists.success++;
      } catch (err) {
        stats.artists.failed++;
        console.error(
          `❌ Failed to migrate artist ${artist.id}:`,
          (err as Error).message,
        );
      }
    }
  } catch (err) {
    console.error("❌ Error migrating artists:", (err as Error).message);
  }

  // ============ 3. MIGRATE FILTERS ============
  console.log("\n📦 Step 3: Migrating new filters...");
  try {
    const existingFilters = await FilterModel.findAll({
      attributes: ["id"],
      raw: true,
    });
    const existingFilterIds = new Set(existingFilters.map((f: any) => f.id));

    const { rows: allFilters } = await sourceClient.query(
      `SELECT * FROM filters ORDER BY id`,
    );

    const newFilters = allFilters.filter(
      (f: any) => !existingFilterIds.has(f.id),
    );
    console.log(`✅ Found ${newFilters.length} new filters to migrate`);

    for (const filter of newFilters) {
      try {
        await FilterModel.upsert(filter as any, { conflictFields: ["id"] });
        stats.filters.success++;
      } catch (err) {
        stats.filters.failed++;
        console.error(
          `❌ Failed to migrate filter ${filter.id}:`,
          (err as Error).message,
        );
      }
    }
  } catch (err) {
    console.error("❌ Error migrating filters:", (err as Error).message);
  }

  // ============ Fetch lastTrackTime once — reused in steps 4–7 ============
  const lastTrackTime = await getLastMigratedTime("tracks");
  if (lastTrackTime) {
    console.log(
      `\n🕐 Latest track in target DB: ${lastTrackTime.toISOString()}`,
    );
  } else {
    console.log("\n⚠️  No tracks in target DB — will migrate all records");
  }

  // ============ 4. MIGRATE ALBUMS (linked to new tracks) ============
  console.log("\n📦 Step 4: Migrating albums linked to new tracks...");
  try {
    const { rows: newTracksWithAlbums } = lastTrackTime
      ? await sourceClient.query(
          `SELECT DISTINCT "albumId" FROM tracks WHERE "createdAt" > $1 AND "albumId" IS NOT NULL`,
          [lastTrackTime],
        )
      : await sourceClient.query(
          `SELECT DISTINCT "albumId" FROM tracks WHERE "albumId" IS NOT NULL`,
        );

    const albumIds = newTracksWithAlbums
      .map((t: any) => t.albumId)
      .filter(Boolean);

    if (albumIds.length > 0) {
      const placeholders = albumIds
        .map((_: any, i: number) => `$${i + 1}`)
        .join(",");

      const [{ rows: albums }, { rows: tracksWithAlbum }] = await Promise.all([
        sourceClient.query(
          `SELECT * FROM albums WHERE id IN (${placeholders})`,
          albumIds,
        ),
        sourceClient.query(
          `SELECT id, "albumId" FROM tracks WHERE "albumId" IN (${placeholders})`,
          albumIds,
        ),
      ]);

      console.log(`✅ Found ${albums.length} albums linked to new tracks`);

      const albumTrackMap = new Map<string, string[]>();
      for (const track of tracksWithAlbum) {
        if (!albumTrackMap.has(track.albumId)) {
          albumTrackMap.set(track.albumId, []);
        }
        albumTrackMap.get(track.albumId)!.push(track.id);
      }

      for (const album of albums) {
        try {
          if (!album.id) continue;
          const trackIds = albumTrackMap.get(album.id) || [];
          const mapped = mapSourceAlbumToModel(album, trackIds);
          await AlbumModel.upsert(mapped as any, { conflictFields: ["id"] });
          stats.albums.success++;
        } catch (err) {
          stats.albums.failed++;
          console.error(
            `❌ Failed to migrate album ${album.id}:`,
            (err as Error).message,
          );
        }
      }
    } else {
      console.log("✅ No new albums to migrate");
    }
  } catch (err) {
    console.error("❌ Error migrating albums:", (err as Error).message);
  }

  // ============ 5. MIGRATE NEW TRACKS (raw SQL — bypasses model validation) ============
  console.log("\n📦 Step 5: Migrating new tracks...");
  const newTrackIds: string[] = [];
  try {
    const { rows: tracks } = lastTrackTime
      ? await sourceClient.query(
          `SELECT * FROM tracks WHERE "createdAt" > $1 ORDER BY "createdAt"`,
          [lastTrackTime],
        )
      : await sourceClient.query(`SELECT * FROM tracks ORDER BY "createdAt"`);

    console.log(`✅ Found ${tracks.length} new tracks to migrate`);

    for (const track of tracks) {
      try {
        const mapped = mapSourceTrackToModel(track);
        if (!mapped.id) {
          console.warn(`⚠️  Skipping track with missing id`);
          continue;
        }
        if (!mapped.trackCode) {
          console.warn(`⚠️  Skipping track ${mapped.id}: missing trackCode`);
          continue;
        }

        // Tracks without both waveformLink and mp3Link are kept inactive
        if (!mapped.waveformLink && !mapped.mp3Link) {
          mapped.status = "inactive";
        }

        const { sql, values } = buildUpsert("tracks", mapped, "trackCode");
        await targetClient.query(sql, values);
        newTrackIds.push(mapped.id as string);
        stats.tracks.success++;

        if (stats.tracks.success % 100 === 0) {
          console.log(`⏳ Migrated ${stats.tracks.success} tracks...`);
        }
      } catch (err) {
        stats.tracks.failed++;
        console.error(
          `❌ Failed to migrate track ${track.id}:`,
          (err as Error).message,
        );
      }
    }
  } catch (err) {
    console.error("❌ Error migrating tracks:", (err as Error).message);
  }

  if (newTrackIds.length === 0) {
    console.log("⚠️  No tracks were successfully migrated, skipping mappings.");
    return;
  }

  const trackPlaceholders = newTrackIds
    .map((_: any, i: number) => `$${i + 1}`)
    .join(", ");

  // ============ 6. MIGRATE TRACK-ARTIST MAPPINGS (for new tracks) ============
  console.log("\n📦 Step 6: Migrating track-artist mappings for new tracks...");
  try {
    const { rows: mappings } = await sourceClient.query(
      `SELECT * FROM artist_track_role_mappings WHERE "trackId" IN (${trackPlaceholders})`,
      newTrackIds,
    );

    console.log(
      `✅ Found ${mappings.length} new track-artist mappings to migrate`,
    );

    const VALID_ROLES = Object.values(ArtistType);

    for (const mapping of mappings) {
      try {
        if (
          !mapping.id ||
          !mapping.artistId ||
          !mapping.trackId ||
          !mapping.role
        ) {
          console.warn(`⚠️  Skipping mapping with missing required fields`);
          continue;
        }

        const normalizedRole = String(mapping.role).toUpperCase();
        if (!VALID_ROLES.includes(normalizedRole as ArtistType)) {
          console.warn(
            `⚠️  Skipping mapping ${mapping.id}: Invalid role "${mapping.role}"`,
          );
          continue;
        }

        const data = {
          id: mapping.id,
          artistId: mapping.artistId,
          trackId: mapping.trackId,
          role: normalizedRole,
          isPrimary: mapping.isPrimary ?? false,
        };
        const keys = Object.keys(data);
        const cols = keys.map((k) => `"${k}"`).join(", ");
        const params = keys.map((_: any, i: number) => `$${i + 1}`).join(", ");
        await targetClient.query(
          `INSERT INTO "track_artist_mappings" (${cols}) VALUES (${params}) ON CONFLICT DO NOTHING`,
          Object.values(data),
        );
        stats.trackArtistMappings.success++;
      } catch (err) {
        stats.trackArtistMappings.failed++;
        console.error(
          `❌ Failed to migrate mapping ${mapping.id}:`,
          (err as Error).message,
        );
      }
    }
  } catch (err) {
    console.error(
      "❌ Error migrating track-artist mappings:",
      (err as Error).message,
    );
  }

  // ============ 7. MIGRATE TRACK-FILTER MAPPINGS (for new tracks) ============
  console.log("\n📦 Step 7: Migrating track-filter mappings for new tracks...");
  try {
    const { rows: mappings } = await sourceClient.query(
      `SELECT * FROM track_filter_mappings WHERE "trackId" IN (${trackPlaceholders})`,
      newTrackIds,
    );

    console.log(
      `✅ Found ${mappings.length} new track-filter mappings to migrate`,
    );

    for (const mapping of mappings) {
      try {
        if (!mapping.id) continue;

        await targetClient.query(
          `INSERT INTO "track_filter_mappings" ("id", "filterId", "trackId")
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [mapping.id, mapping.filterId, mapping.trackId],
        );
        stats.trackFilterMappings.success++;
      } catch (err) {
        stats.trackFilterMappings.failed++;
        console.error(
          `❌ Failed to migrate mapping ${mapping.id}:`,
          (err as Error).message,
        );
      }
    }
  } catch (err) {
    console.error(
      "❌ Error migrating track-filter mappings:",
      (err as Error).message,
    );
  }
}

// ============ MAIN EXECUTION ============

async function main() {
  const sourceClient = new Client(SOURCE_DB_CONFIG);
  const targetClient = new Client(TARGET_DB_CONFIG);

  const targetSequelize = new Sequelize({
    dialect: "postgres",
    host: TARGET_DB_CONFIG.host,
    port: TARGET_DB_CONFIG.port,
    username: TARGET_DB_CONFIG.user,
    password: TARGET_DB_CONFIG.password,
    database: TARGET_DB_CONFIG.database,
    logging: false,
    dialectOptions: { ssl: { rejectUnauthorized: false } },
    define: { freezeTableName: true, timestamps: true },
  });

  targetSequelize.addModels([
    TrackModel,
    ArtistModel,
    TrackArtistMappingModel,
    FilterModel,
    TrackFilterMappingModel,
    SkuModel,
    OwnerModel,
    AlbumModel,
  ]);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database");

    await targetClient.connect();
    console.log("✅ Connected to target database (native)");

    await targetSequelize.authenticate();
    console.log("✅ Connected to target database (sequelize)");

    await migrateNewData(sourceClient, targetClient);

    console.log("\n" + "=".repeat(60));
    console.log("📊 MIGRATION SUMMARY");
    console.log("=".repeat(60));
    console.log(
      `\n✅ Artists:               ${stats.artists.success} success, ${stats.artists.failed} failed`,
    );
    console.log(
      `✅ Owners:                ${stats.owners.success} success, ${stats.owners.failed} failed`,
    );
    console.log(
      `✅ Filters:               ${stats.filters.success} success, ${stats.filters.failed} failed`,
    );
    console.log(
      `✅ Albums:                ${stats.albums.success} success, ${stats.albums.failed} failed`,
    );
    console.log(
      `✅ Tracks:                ${stats.tracks.success} success, ${stats.tracks.failed} failed`,
    );
    console.log(
      `✅ Track-Artist Mappings: ${stats.trackArtistMappings.success} success, ${stats.trackArtistMappings.failed} failed`,
    );
    console.log(
      `✅ Track-Filter Mappings: ${stats.trackFilterMappings.success} success, ${stats.trackFilterMappings.failed} failed`,
    );
    console.log("=".repeat(60));
    console.log("✨ Migration completed!\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await sourceClient.end();
    await targetClient.end();
    await targetSequelize.close();
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});

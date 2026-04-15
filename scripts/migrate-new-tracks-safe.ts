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
import { CampaignModel } from "../services/persistence-service/campaign/schemas/campaign.schema";
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

// ============ TRACKCODE GENERATION ============

// Parse a trackCode like "HC001234" → { prefix: "HC", num: 1234, padLen: 6 }
function parseTrackCode(
  code: string,
): { prefix: string; num: number; padLen: number } | null {
  const match = code.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    num: parseInt(match[2], 10),
    padLen: match[2].length,
  };
}

// Find the highest numeric trackCode with the same prefix in the target DB
// and return a generator that yields the next available codes
async function buildTrackCodeGenerator(
  targetClient: Client,
  existingCodesInTarget: Set<string>,
): Promise<() => string> {
  const { rows } = await targetClient.query(
    `SELECT "trackCode" FROM tracks ORDER BY "createdAt" DESC`,
  );

  let prefix = "HC";
  let padLen = 6;
  let maxNum = 0;

  for (const row of rows) {
    const parsed = parseTrackCode(row.trackCode);
    if (!parsed) continue;
    if (parsed.num > maxNum) {
      maxNum = parsed.num;
      prefix = parsed.prefix;
      padLen = parsed.padLen;
    }
  }

  console.log(
    `🔢 TrackCode generator: prefix="${prefix}", next from ${maxNum + 1}`,
  );

  let counter = maxNum + 1;

  return () => {
    let candidate: string;
    do {
      candidate = `${prefix}${String(counter).padStart(padLen, "0")}`;
      counter++;
    } while (existingCodesInTarget.has(candidate));
    existingCodesInTarget.add(candidate); // reserve it
    return candidate;
  };
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

const TRACK_ARRAY_FIELDS = ["songKey", "displayTags", "ownerId", "publisherId"];
const TRACK_JSONB_FIELDS = ["industry"];
const TRACK_BOOLEAN_FIELDS = ["trending", "hasVocals", "isPRO"];
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
        continue;
      }
      const num = parseFloat(value);
      mapped[field] = isNaN(num) ? null : Math.round(num);
      continue;
    }
    mapped[field] = value;
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

// ============ RAW SQL UPSERT ============

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
  tracks: { success: number; failed: number; reassigned: number };
  trackArtistMappings: { success: number; failed: number };
  trackFilterMappings: { success: number; failed: number };
}

const stats: MigrationStats = {
  artists: { success: 0, failed: 0 },
  owners: { success: 0, failed: 0 },
  filters: { success: 0, failed: 0 },
  albums: { success: 0, failed: 0 },
  tracks: { success: 0, failed: 0, reassigned: 0 },
  trackArtistMappings: { success: 0, failed: 0 },
  trackFilterMappings: { success: 0, failed: 0 },
};

// ============ MAIN MIGRATION ============

async function migrateNewData(
  sourceClient: Client,
  targetClient: Client,
): Promise<void> {
  console.log("\n🚀 Starting SAFE incremental migration (no overrides)...\n");

  // ── 1. OWNERS ──────────────────────────────────────────────────────────────
  console.log("📦 Step 1: Migrating new owners...");
  try {
    const { rows: existingOwners } = await targetClient.query(
      `SELECT id FROM owners`,
    );
    const existingOwnerIds = new Set(existingOwners.map((r: any) => r.id));

    const { rows: allOwners } = await sourceClient.query(
      `SELECT * FROM owners ORDER BY "createdAt"`,
    );
    const newOwners = allOwners.filter((o: any) => !existingOwnerIds.has(o.id));
    console.log(`   Found ${newOwners.length} new owners`);

    for (const owner of newOwners) {
      try {
        await OwnerModel.upsert(owner as any, { conflictFields: ["id"] });
        stats.owners.success++;
      } catch (err) {
        stats.owners.failed++;
        console.error(`   ❌ Owner ${owner.id}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    console.error("❌ Error migrating owners:", (err as Error).message);
  }

  // ── 2. ARTISTS ─────────────────────────────────────────────────────────────
  console.log("\n📦 Step 2: Migrating new artists...");
  try {
    const { rows: existingArtists } = await targetClient.query(
      `SELECT id FROM artists`,
    );
    const existingArtistIds = new Set(existingArtists.map((r: any) => r.id));

    const { rows: allArtists } = await sourceClient.query(
      `SELECT * FROM artists ORDER BY "createdAt"`,
    );
    const newArtists = allArtists.filter(
      (a: any) => !existingArtistIds.has(a.id),
    );
    console.log(`   Found ${newArtists.length} new artists`);

    for (const artist of newArtists) {
      const mapped: Record<string, any> = {};
      try {
        if (!artist.id) continue;
        for (const field of [
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
        ]) {
          const val = artist[field];
          if (val === undefined) continue;
          mapped[field] = field === "type" ? toStringArray(val) : val;
        }
        await ArtistModel.upsert(mapped as any, { conflictFields: ["id"] });
        stats.artists.success++;
      } catch (err: any) {
        // If unique constraint on artistCode/name_slug, try upsert on artistCode
        if (err.name === "SequelizeUniqueConstraintError") {
          try {
            await ArtistModel.upsert(mapped as any, {
              conflictFields: ["artistCode"],
            });
            stats.artists.success++;
            continue;
          } catch (innerErr) {
            stats.artists.failed++;
            console.error(
              `   ❌ Artist ${artist.id} (${artist.artistCode}): ${(innerErr as Error).message}`,
            );
            continue;
          }
        }
        stats.artists.failed++;
        console.error(
          `   ❌ Artist ${artist.id} (${artist.artistCode}): ${(err as Error).message}`,
        );
      }
    }
  } catch (err) {
    console.error("❌ Error migrating artists:", (err as Error).message);
  }

  // ── 3. FILTERS ─────────────────────────────────────────────────────────────
  console.log("\n📦 Step 3: Migrating new filters...");
  try {
    const { rows: existingFilters } = await targetClient.query(
      `SELECT id FROM filters`,
    );
    const existingFilterIds = new Set(existingFilters.map((r: any) => r.id));

    const { rows: allFilters } = await sourceClient.query(
      `SELECT * FROM filters ORDER BY id`,
    );
    const newFilters = allFilters.filter(
      (f: any) => !existingFilterIds.has(f.id),
    );
    console.log(`   Found ${newFilters.length} new filters`);

    for (const filter of newFilters) {
      try {
        await FilterModel.upsert(filter as any, { conflictFields: ["id"] });
        stats.filters.success++;
      } catch (err) {
        stats.filters.failed++;
        console.error(`   ❌ Filter ${filter.id}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    console.error("❌ Error migrating filters:", (err as Error).message);
  }

  // ── 4. IDENTIFY NEW TRACKS ─────────────────────────────────────────────────
  console.log("\n📦 Step 4: Identifying new tracks from source...");

  // All existing track IDs in target (by UUID)
  const { rows: existingTrackRows } = await targetClient.query(
    `SELECT id, "trackCode" FROM tracks`,
  );
  const existingTrackIds = new Set(existingTrackRows.map((r: any) => r.id));
  const existingTrackCodes = new Set(
    existingTrackRows.map((r: any) => r.trackCode),
  );

  // Fetch all tracks from source
  const { rows: allSourceTracks } = await sourceClient.query(
    `SELECT * FROM tracks ORDER BY "createdAt"`,
  );

  // Only tracks whose UUID doesn't exist in target
  const newTracks = allSourceTracks.filter(
    (t: any) => !existingTrackIds.has(t.id),
  );

  console.log(
    `   Source total: ${allSourceTracks.length} | Already in target: ${existingTrackIds.size} | Truly new: ${newTracks.length}`,
  );

  if (newTracks.length === 0) {
    console.log("   ✅ No new tracks to migrate.");
    return;
  }

  // ── 5. RESOLVE TRACKCODE CONFLICTS ────────────────────────────────────────
  console.log("\n📦 Step 5: Resolving trackCode conflicts...");
  const nextTrackCode = await buildTrackCodeGenerator(
    targetClient,
    existingTrackCodes,
  );

  // Map: original trackCode → resolved trackCode (for logging)
  const trackCodeMap = new Map<string, string>();

  for (const track of newTracks) {
    const original = track.trackCode as string;
    if (!original) continue;
    if (existingTrackCodes.has(original)) {
      const newCode = nextTrackCode();
      trackCodeMap.set(original, newCode);
      console.log(
        `   ⚠️  Conflict: "${original}" → reassigned to "${newCode}"`,
      );
    } else {
      trackCodeMap.set(original, original);
      existingTrackCodes.add(original); // reserve so no future dupe
    }
  }

  // ── 6. MIGRATE ALBUMS ─────────────────────────────────────────────────────
  console.log("\n📦 Step 6: Migrating albums for new tracks...");
  try {
    const newTrackSourceIds = newTracks.map((t: any) => t.id);
    const placeholders = newTrackSourceIds
      .map((_: any, i: number) => `$${i + 1}`)
      .join(", ");

    const { rows: albumIdRows } = await sourceClient.query(
      `SELECT DISTINCT "albumId" FROM tracks WHERE id IN (${placeholders}) AND "albumId" IS NOT NULL`,
      newTrackSourceIds,
    );
    const albumIds = albumIdRows.map((r: any) => r.albumId).filter(Boolean);

    if (albumIds.length > 0) {
      const albumPlaceholders = albumIds
        .map((_: any, i: number) => `$${i + 1}`)
        .join(", ");
      const [{ rows: albums }, { rows: tracksWithAlbum }] = await Promise.all([
        sourceClient.query(
          `SELECT * FROM albums WHERE id IN (${albumPlaceholders})`,
          albumIds,
        ),
        sourceClient.query(
          `SELECT id, "albumId" FROM tracks WHERE "albumId" IN (${albumPlaceholders})`,
          albumIds,
        ),
      ]);

      const albumTrackMap = new Map<string, string[]>();
      for (const t of tracksWithAlbum) {
        if (!albumTrackMap.has(t.albumId)) albumTrackMap.set(t.albumId, []);
        albumTrackMap.get(t.albumId)!.push(t.id);
      }

      console.log(`   Found ${albums.length} albums`);
      for (const album of albums) {
        try {
          if (!album.id) continue;
          const trackIds = albumTrackMap.get(album.id) || [];
          const mapped = mapSourceAlbumToModel(album, trackIds);
          await AlbumModel.upsert(mapped as any, { conflictFields: ["id"] });
          stats.albums.success++;
        } catch (err) {
          stats.albums.failed++;
          console.error(`   ❌ Album ${album.id}: ${(err as Error).message}`);
        }
      }
    } else {
      console.log("   No albums to migrate");
    }
  } catch (err) {
    console.error("❌ Error migrating albums:", (err as Error).message);
  }

  // ── 7. MIGRATE TRACKS ─────────────────────────────────────────────────────
  console.log("\n📦 Step 7: Migrating new tracks...");
  const migratedTrackIds: string[] = [];

  for (const track of newTracks) {
    try {
      const mapped = mapSourceTrackToModel(track);
      if (!mapped.id) {
        console.warn("   ⚠️  Skipping track with missing id");
        continue;
      }
      if (!mapped.trackCode) {
        console.warn(`   ⚠️  Skipping track ${mapped.id}: missing trackCode`);
        continue;
      }

      // Apply resolved trackCode
      const resolvedCode = trackCodeMap.get(mapped.trackCode as string);
      if (!resolvedCode) {
        console.warn(`   ⚠️  No resolved code for ${mapped.trackCode}`);
        continue;
      }

      mapped.trackCode = resolvedCode;

      if (!mapped.waveformLink && !mapped.mp3Link) {
        mapped.status = "inactive";
      }

      const { sql, values } = buildUpsert("tracks", mapped, "id");
      await targetClient.query(sql, values);
      migratedTrackIds.push(mapped.id as string);
      stats.tracks.success++;
      if (resolvedCode !== track.trackCode) stats.tracks.reassigned++;

      console.log(
        `   ✅ [${resolvedCode}]${resolvedCode !== track.trackCode ? ` (was: ${track.trackCode})` : ""} "${mapped.name}" | status=${mapped.status ?? "ACTIVE"}`,
      );
    } catch (err) {
      stats.tracks.failed++;
      console.error(`   ❌ Track ${track.id}: ${(err as Error).message}`);
    }
  }

  if (migratedTrackIds.length === 0) {
    console.log("   ⚠️  No tracks were migrated, skipping mappings.");
    return;
  }

  const trackPlaceholders = migratedTrackIds
    .map((_: any, i: number) => `$${i + 1}`)
    .join(", ");

  // ── 8. TRACK-ARTIST MAPPINGS ───────────────────────────────────────────────
  console.log("\n📦 Step 8: Migrating track-artist mappings...");
  try {
    const { rows: mappings } = await sourceClient.query(
      `SELECT * FROM artist_track_role_mappings WHERE "trackId" IN (${trackPlaceholders})`,
      migratedTrackIds,
    );
    console.log(`   Found ${mappings.length} mappings`);

    const VALID_ROLES = Object.values(ArtistType);
    for (const mapping of mappings) {
      try {
        if (
          !mapping.id ||
          !mapping.artistId ||
          !mapping.trackId ||
          !mapping.role
        )
          continue;
        const normalizedRole = String(mapping.role).toUpperCase();
        if (!VALID_ROLES.includes(normalizedRole as ArtistType)) continue;

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
          `   ❌ Artist mapping ${mapping.id}: ${(err as Error).message}`,
        );
      }
    }
  } catch (err) {
    console.error(
      "❌ Error migrating track-artist mappings:",
      (err as Error).message,
    );
  }

  // ── 9. TRACK-FILTER MAPPINGS ───────────────────────────────────────────────
  console.log("\n📦 Step 9: Migrating track-filter mappings...");
  try {
    const { rows: mappings } = await sourceClient.query(
      `SELECT * FROM track_filter_mappings WHERE "trackId" IN (${trackPlaceholders})`,
      migratedTrackIds,
    );
    console.log(`   Found ${mappings.length} mappings`);

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
          `   ❌ Filter mapping ${mapping.id}: ${(err as Error).message}`,
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

// ============ MAIN ============

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
    CampaignModel,
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
      `✅ Tracks:                ${stats.tracks.success} success, ${stats.tracks.failed} failed (${stats.tracks.reassigned} trackCodes reassigned)`,
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

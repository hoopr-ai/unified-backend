import { Client } from "pg";

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
  host: "34.47.200.207",
  port: 5432,
  user: "select-server-dev",
  password: "hO82GcLotttB5bLyoeG1",
  database: "sage_staging",
};

// ============ HELPERS ============
function toStringArray(value: string | null): string[] | null {
  if (!value) return null;
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

function toBoolean(value: string | null): boolean | null {
  if (value === null || value === undefined) return null;
  if (value === "Y" || value === "y") return true;
  if (value === "N" || value === "n") return false;
  return null;
}

function toJsonbStrict(value: any): object | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "{" || trimmed === "[" || trimmed.endsWith(":") || trimmed.endsWith(",")) {
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

// ============ TRACK MIGRATION ============
const TRACK_MODEL_FIELDS = [
  "id", "trackCode", "type", "name", "description", "duration", "size", "bpm",
  "songKey", "timeSignature", "region", "releaseRegion", "releaseDate", "ownerId",
  "hasVocals", "isPRO", "displayTags", "sourceLink", "name_slug", "waveformLink",
  "mp3Link", "ISRC", "lyrics", "tier", "energy", "industry", "status",
  "createdAt", "updatedAt", "publisherId", "trending", "premium", "reelCount",
  "partnerId", "bollywood",
] as const;

const ARRAY_FIELDS = ["songKey", "displayTags", "ownerId", "publisherId"];
const JSONB_FIELDS = ["industry"];
const BOOLEAN_FIELDS = ["trending"];

function mapSourceTrackToModel(sourceTrack: any): Record<string, any> {
  const mappedTrack: Record<string, any> = {};
  for (const field of TRACK_MODEL_FIELDS) {
    const sourceValue = sourceTrack[field];
    if (sourceValue === undefined) continue;
    if (ARRAY_FIELDS.includes(field)) { mappedTrack[field] = toStringArray(sourceValue); continue; }
    if (JSONB_FIELDS.includes(field)) { mappedTrack[field] = toJsonbStrict(sourceValue); continue; }
    if (BOOLEAN_FIELDS.includes(field)) { mappedTrack[field] = toBoolean(sourceValue); continue; }
    mappedTrack[field] = sourceValue;
  }
  return mappedTrack;
}

// Build parameterized upsert SQL
function buildUpsert(table: string, data: Record<string, any>, conflictCol: string): { sql: string; values: any[] } {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const cols = keys.map((k) => `"${k}"`).join(", ");
  const params = keys.map((_, i) => `$${i + 1}`).join(", ");
  const updates = keys.filter((k) => k !== conflictCol).map((k) => `"${k}" = EXCLUDED."${k}"`).join(", ");
  return {
    sql: `INSERT INTO "${table}" (${cols}) VALUES (${params}) ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updates}`,
    values,
  };
}

// ============ MAIN ============
async function migrateNewTracks() {
  const sourceClient = new Client(SOURCE_DB_CONFIG);
  const targetClient = new Client(TARGET_DB_CONFIG);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database");

    await targetClient.connect();
    console.log("✅ Connected to target database");

    // ============ STEP 1: Find latest createdAt in target ============
    const latestResult = await targetClient.query(`SELECT MAX("createdAt") AS latest FROM tracks`);
    const latestCreatedAt: Date | null = latestResult.rows[0]?.latest ?? null;
    if (latestCreatedAt) {
      console.log(`\n🕐 Latest track in target DB: ${latestCreatedAt.toISOString()}`);
      console.log(`📦 Fetching tracks from source created after this date...`);
    } else {
      console.log(`\n⚠️  No tracks found in target DB — fetching all tracks from source`);
    }

    // ============ STEP 2: Fetch only new tracks from source ============
    const query = latestCreatedAt
      ? `SELECT * FROM tracks WHERE "createdAt" > $1 ORDER BY "createdAt" ASC`
      : `SELECT * FROM tracks ORDER BY "createdAt" ASC`;

    const { rows: newTracks } = latestCreatedAt
      ? await sourceClient.query(query, [latestCreatedAt])
      : await sourceClient.query(query);

    console.log(`📦 Found ${newTracks.length} new tracks to migrate`);

    if (newTracks.length === 0) {
      console.log("✅ Target DB is already up to date. Nothing to migrate.");
      return;
    }

    // ============ STEP 3: Migrate owners referenced by new tracks ============
    console.log("\n📦 Migrating owners for new tracks...");

    const allOwnerIds: string[] = [];
    for (const track of newTracks) {
      const ownerIdRaw = track.ownerId;
      if (!ownerIdRaw) continue;
      const ids: string[] = Array.isArray(ownerIdRaw)
        ? ownerIdRaw
        : String(ownerIdRaw).split(",").map((s: string) => s.trim()).filter(Boolean);
      allOwnerIds.push(...ids);
    }

    const uniqueOwnerIds = [...new Set(allOwnerIds)];

    if (uniqueOwnerIds.length > 0) {
      const ownerPlaceholders = uniqueOwnerIds.map((_, i) => `$${i + 1}`).join(", ");
      const { rows: owners } = await sourceClient.query(
        `SELECT id, "ownerCode", username, type, "subType", category, status, "revenueGenerated", "revenueShare", "licenseStart", "licenseEnd", "isActive", "IPRS", remarks, metadata, "usageInfo", "restrictedCategories", deleted, "createdAt", "updatedAt" FROM owners WHERE id IN (${ownerPlaceholders})`,
        uniqueOwnerIds,
      );

      console.log(`📦 Found ${owners.length} owners to migrate`);

      let ownerSuccess = 0;
      let ownerError = 0;

      for (const owner of owners) {
        try {
          if (!owner.id) continue;
          const data: Record<string, any> = {};
          for (const [k, v] of Object.entries(owner)) {
            if (v !== undefined && v !== null) data[k] = v;
          }
          const { sql, values } = buildUpsert("owners", data, "id");
          await targetClient.query(sql, values);
          ownerSuccess++;
        } catch (err: any) {
          ownerError++;
          console.error(`❌ Error migrating owner ${owner.id}:`, err.message);
        }
      }

      console.log(`✅ Owners: ${ownerSuccess} succeeded, ${ownerError} failed`);
    } else {
      console.log("⚠️  No owner IDs found in new tracks, skipping owner migration.");
    }

    // ============ STEP 4: Migrate tracks ============

    console.log("\n📦 Migrating tracks...");
    let trackSuccess = 0;
    let trackError = 0;
    const newTrackIds: string[] = [];

    for (const track of newTracks) {
      try {
        const mappedTrack = mapSourceTrackToModel(track);
        if (!mappedTrack.id) {
          console.warn(`⚠️  Skipping track with missing id`);
          continue;
        }

        const { sql, values } = buildUpsert("tracks", mappedTrack, "trackCode");
        await targetClient.query(sql, values);
        newTrackIds.push(mappedTrack.id as string);
        trackSuccess++;

        if (trackSuccess % 100 === 0) {
          console.log(`⏳ Migrated ${trackSuccess} tracks...`);
        }
      } catch (err: any) {
        trackError++;
        console.error(`❌ Error migrating track ${track.id}:`, err.message);
      }
    }

    console.log(`✅ Tracks: ${trackSuccess} succeeded, ${trackError} failed`);

    if (newTrackIds.length === 0) {
      console.log("⚠️  No tracks were successfully migrated, skipping mappings.");
      return;
    }

    // ============ STEP 5: Migrate track-artist mappings for new tracks ============
    console.log("\n📦 Migrating track-artist mappings for new tracks...");

    const placeholders = newTrackIds.map((_, i) => `$${i + 1}`).join(", ");
    const { rows: artistMappings } = await sourceClient.query(
      `SELECT * FROM artist_track_role_mappings WHERE "trackId" IN (${placeholders})`,
      newTrackIds,
    );

    console.log(`📦 Found ${artistMappings.length} track-artist mappings`);

    let artistMappingSuccess = 0;
    let artistMappingError = 0;

    for (const mapping of artistMappings) {
      try {
        if (!mapping.id || !mapping.artistId || !mapping.trackId || !mapping.role) {
          console.warn(`⚠️  Skipping artist mapping with missing required fields`);
          continue;
        }

        const data = {
          id: mapping.id,
          artistId: mapping.artistId,
          trackId: mapping.trackId,
          role: String(mapping.role).toUpperCase(),
          isPrimary: mapping.isPrimary ?? false,
        };
        const keys = Object.keys(data);
        const cols = keys.map((k) => `"${k}"`).join(", ");
        const params = keys.map((_, i) => `$${i + 1}`).join(", ");
        await targetClient.query(
          `INSERT INTO "track_artist_mappings" (${cols}) VALUES (${params}) ON CONFLICT DO NOTHING`,
          Object.values(data),
        );
        artistMappingSuccess++;
      } catch (err: any) {
        artistMappingError++;
        console.error(`❌ Error migrating artist mapping ${mapping.id}:`, err.message);
      }
    }

    console.log(`✅ Track-artist mappings: ${artistMappingSuccess} succeeded, ${artistMappingError} failed`);

    // ============ STEP 6: Migrate track-filter mappings for new tracks ============
    console.log("\n📦 Migrating track-filter mappings for new tracks...");

    const { rows: filterMappings } = await sourceClient.query(
      `SELECT * FROM track_filter_mappings WHERE "trackId" IN (${placeholders})`,
      newTrackIds,
    );

    console.log(`📦 Found ${filterMappings.length} track-filter mappings`);

    let filterMappingSuccess = 0;
    let filterMappingError = 0;

    for (const mapping of filterMappings) {
      try {
        if (!mapping.id) {
          console.warn(`⚠️  Skipping filter mapping with missing id`);
          continue;
        }

        const data = { id: mapping.id, filterId: mapping.filterId, trackId: mapping.trackId };
        const keys = Object.keys(data);
        const cols = keys.map((k) => `"${k}"`).join(", ");
        const params = keys.map((_, i) => `$${i + 1}`).join(", ");
        await targetClient.query(
          `INSERT INTO "track_filter_mappings" (${cols}) VALUES (${params}) ON CONFLICT DO NOTHING`,
          Object.values(data),
        );
        filterMappingSuccess++;
      } catch (err: any) {
        filterMappingError++;
        console.error(`❌ Error migrating filter mapping ${mapping.id}:`, err.message);
      }
    }

    console.log(`✅ Track-filter mappings: ${filterMappingSuccess} succeeded, ${filterMappingError} failed`);

    console.log(`\n✅ All done! Migrated ${newTrackIds.length} new tracks with their artist and filter mappings.`);
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

migrateNewTracks();

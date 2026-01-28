import { Client } from "pg";
import { Sequelize } from "sequelize-typescript";
import { TrackModel } from "../services/persistence-service/track/modules.export";

function toStringArray(value: string | null): string[] | null {
  if (!value) return null;

  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
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

// ============ SOURCE DATABASE (select_staging) ============
const SOURCE_DB_CONFIG = {
  host: "34.100.172.44",
  port: 5432,
  user: "s-prod",
  password: "ROUG2gact4whif_oorn",
  database: "S-PROD",
};

// ============ TARGET DATABASE (unified_staging) ============
const TARGET_DB_CONFIG = {
  host: "34.47.200.207",
  port: 5432,
  username: "select-server-dev",
  password: "hO82GcLotttB5bLyoeG1",
  database: "sage_staging",
};

// Fields that exist in TrackModel (from track.schema.ts)
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

// Fields that need array conversion (comma-separated string -> string[])
const ARRAY_FIELDS = ["songKey", "displayTags", "ownerId", "publisherId"];

// Fields that need JSONB conversion
const JSONB_FIELDS = ["industry"];

// Fields that need boolean conversion (Y/N -> true/false)
const BOOLEAN_FIELDS = ["trending"];

function mapSourceTrackToModel(sourceTrack: any): Partial<TrackModel> {
  const mappedTrack: Record<string, any> = {};

  for (const field of TRACK_MODEL_FIELDS) {
    const sourceValue = sourceTrack[field];

    // Skip if field doesn't exist in source
    if (sourceValue === undefined) {
      continue;
    }

    // Handle array fields
    if (ARRAY_FIELDS.includes(field)) {
      mappedTrack[field] = toStringArray(sourceValue);
      continue;
    }

    // Handle JSONB fields
    if (JSONB_FIELDS.includes(field)) {
      mappedTrack[field] = toJsonbStrict(sourceValue);
      continue;
    }

    // Handle boolean fields (Y/N -> true/false)
    if (BOOLEAN_FIELDS.includes(field)) {
      mappedTrack[field] = toBoolean(sourceValue);
      continue;
    }

    // Pass through other fields
    mappedTrack[field] = sourceValue;
  }

  return mappedTrack as Partial<TrackModel>;
}

async function migrateTracks() {
  const sourceClient = new Client(SOURCE_DB_CONFIG);

  // Create Sequelize instance for target database
  const targetSequelize = new Sequelize({
    dialect: "postgres",
    host: TARGET_DB_CONFIG.host,
    port: TARGET_DB_CONFIG.port,
    username: TARGET_DB_CONFIG.username,
    password: TARGET_DB_CONFIG.password,
    database: TARGET_DB_CONFIG.database,
    logging: false,
    define: {
      freezeTableName: true,
      timestamps: true,
    },
  });

  // Register TrackModel with this Sequelize instance
  targetSequelize.addModels([TrackModel]);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database (select_staging)");

    await targetSequelize.authenticate();
    console.log("✅ Connected to target database (unified_staging)");

    // Fetch all tracks from source
    const { rows: tracks } = await sourceClient.query(`SELECT * FROM tracks`);
    console.log(`📦 Found ${tracks.length} tracks to migrate`);

    if (tracks.length === 0) {
      console.log("No tracks to migrate");
      return;
    }

    // Log fields that will be skipped
    if (tracks.length > 0) {
      const sourceFields = Object.keys(tracks[0]);
      const skippedFields = sourceFields.filter(
        (f) => !TRACK_MODEL_FIELDS.includes(f as any)
      );
      if (skippedFields.length > 0) {
        console.log(`⚠️  Skipping fields not in TrackModel: ${skippedFields.join(", ")}`);
      }
    }

    let successCount = 0;
    let errorCount = 0;

    for (const track of tracks) {
      try {
        const mappedTrack = mapSourceTrackToModel(track);

        // Ensure id is present for upsert
        if (!mappedTrack.id) {
          console.warn(`⚠️  Skipping track with missing id`);
          continue;
        }

        // Use upsert to handle conflicts on id
        await TrackModel.upsert(mappedTrack as any, {
          conflictFields: ["id"],
        });

        successCount++;

        if (successCount % 100 === 0) {
          console.log(`⏳ Migrated ${successCount} tracks...`);
        }
      } catch (err: any) {
        errorCount++;
        console.error(`❌ Error migrating track ${track.id}:`, err.message);
      }
    }

    console.log(
      `\n✅ Migration complete: ${successCount} succeeded, ${errorCount} failed`
    );
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await sourceClient.end();
    await targetSequelize.close();
  }
}

migrateTracks();

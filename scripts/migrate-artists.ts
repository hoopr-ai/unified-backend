import { Client } from "pg";
import { Sequelize } from "sequelize-typescript";
import { ArtistModel } from "../services/persistence-service/artists/modules.export";

function toStringArray(value: string | null): string[] | null {
  if (!value) return null;

  // Handle PostgreSQL array format: {value1,value2}
  if (value.startsWith("{") && value.endsWith("}")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((v) => v.trim().replace(/"/g, ""))
      .filter(Boolean);
  }

  // Handle comma-separated string
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
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
  // host: "34.47.200.207",
  // port: 5432,
  // username: "select-server-dev",
  // password: "hO82GcLotttB5bLyoeG1",
  // database: "sage_staging",
  host: process.env.DB_HOST || "34.47.153.109",
  username: process.env.DB_USER || "unified-prod",
  password: process.env.DB_PASSWORD || 'X"E6o+`{yvN|c30R',
  database: process.env.DB_NAME || "unified-backend-prod",
  port: parseInt(process.env.DB_PORT || "5432"),
  ssl: { rejectUnauthorized: false },
};

// Fields that exist in ArtistModel (from artist.schema.ts)
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

// Fields that need array conversion
const ARRAY_FIELDS = ["type"];

function mapSourceArtistToModel(sourceArtist: any): Partial<ArtistModel> {
  const mappedArtist: Record<string, any> = {};

  for (const field of ARTIST_MODEL_FIELDS) {
    const sourceValue = sourceArtist[field];

    // Skip if field doesn't exist in source
    if (sourceValue === undefined) {
      continue;
    }

    // Handle array fields
    if (ARRAY_FIELDS.includes(field)) {
      mappedArtist[field] = toStringArray(sourceValue);
      continue;
    }

    // Pass through other fields
    mappedArtist[field] = sourceValue;
  }

  return mappedArtist as Partial<ArtistModel>;
}

async function migrateArtists() {
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
    dialectOptions: {
      ssl: { rejectUnauthorized: false },
    },
    define: {
      freezeTableName: true,
      timestamps: true,
    },
  });

  // Register ArtistModel with this Sequelize instance
  targetSequelize.addModels([ArtistModel]);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database (select_staging)");

    await targetSequelize.authenticate();
    console.log("✅ Connected to target database (unified_staging)");

    // Fetch all artists from source
    const { rows: artists } = await sourceClient.query(`SELECT * FROM artists`);
    console.log(`📦 Found ${artists.length} artists to migrate`);

    if (artists.length === 0) {
      console.log("No artists to migrate");
      return;
    }

    // Log fields that will be skipped
    if (artists.length > 0) {
      const sourceFields = Object.keys(artists[0]);
      const skippedFields = sourceFields.filter(
        (f) => !ARTIST_MODEL_FIELDS.includes(f as any),
      );
      if (skippedFields.length > 0) {
        console.log(
          `⚠️  Skipping fields not in ArtistModel: ${skippedFields.join(", ")}`,
        );
      }
    }

    let successCount = 0;
    let errorCount = 0;

    for (const artist of artists) {
      try {
        const mappedArtist = mapSourceArtistToModel(artist);

        // Ensure id is present for upsert
        if (!mappedArtist.id) {
          console.warn(`⚠️  Skipping artist with missing id`);
          continue;
        }

        // Use upsert to handle conflicts on artistCode (unique business key)
        await ArtistModel.upsert(mappedArtist as any, {
          conflictFields: ["artistCode"],
        });

        successCount++;

        if (successCount % 100 === 0) {
          console.log(`⏳ Migrated ${successCount} artists...`);
        }
      } catch (err: any) {
        errorCount++;
        console.error(`❌ Error migrating artist ${artist.id}:`, err.message);
      }
    }

    console.log(
      `\n✅ Migration complete: ${successCount} succeeded, ${errorCount} failed`,
    );
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await sourceClient.end();
    await targetSequelize.close();
  }
}

migrateArtists();

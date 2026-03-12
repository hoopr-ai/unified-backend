import { Client } from "pg";
import { Sequelize } from "sequelize-typescript";
import {
  TrackArtistMappingModel,
  ArtistModel,
} from "../services/persistence-service/artists/modules.export";
import { TrackModel } from "../services/persistence-service/track/modules.export";
import {
  TrackFilterMappingModel,
  FilterModel,
} from "../services/persistence-service/filter/modules.export";
import { SkuModel } from "../services/persistence-service/sku/modules.export";
import { ArtistType } from "../services/dto-service/modules.export";

// Valid artist roles (uppercase)
const VALID_ROLES = Object.values(ArtistType);

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

// Fields mapping from source to target
const MAPPING_FIELDS = [
  "id",
  "artistId",
  "trackId",
  "role",
  "isPrimary",
] as const;

function mapSourceToModel(
  sourceMapping: any,
): Partial<TrackArtistMappingModel> {
  const mapped: Record<string, any> = {};

  for (const field of MAPPING_FIELDS) {
    const sourceValue = sourceMapping[field];

    if (sourceValue === undefined) {
      continue;
    }

    // Handle role field - ensure uppercase and validate
    if (field === "role") {
      const normalizedRole = String(sourceValue).toUpperCase();
      if (!VALID_ROLES.includes(normalizedRole as ArtistType)) {
        console.warn(
          `⚠️  Invalid role "${sourceValue}" for mapping ${sourceMapping.id}, skipping...`,
        );
        return {};
      }
      mapped[field] = normalizedRole;
    } else {
      mapped[field] = sourceValue;
    }
  }

  return mapped as Partial<TrackArtistMappingModel>;
}

async function migrateTrackArtistMappings() {
  const sourceClient = new Client(SOURCE_DB_CONFIG);

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

  // Register models with this Sequelize instance
  targetSequelize.addModels([
    ArtistModel,
    TrackModel,
    TrackArtistMappingModel,
    TrackFilterMappingModel,
    FilterModel,
    SkuModel,
  ]);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database");

    await targetSequelize.authenticate();
    console.log("✅ Connected to target database");

    // Fetch all mappings from source table
    const { rows: mappings } = await sourceClient.query(
      `SELECT * FROM artist_track_role_mappings`,
    );
    console.log(`📦 Found ${mappings.length} track-artist mappings to migrate`);

    if (mappings.length === 0) {
      console.log("No mappings to migrate");
      return;
    }

    // Log fields that will be skipped
    if (mappings.length > 0) {
      const sourceFields = Object.keys(mappings[0]);
      const skippedFields = sourceFields.filter(
        (f) => !MAPPING_FIELDS.includes(f as any),
      );
      if (skippedFields.length > 0) {
        console.log(
          `⚠️  Skipping fields not in model: ${skippedFields.join(", ")}`,
        );
      }
    }

    let successCount = 0;
    let errorCount = 0;

    for (const mapping of mappings) {
      try {
        const mappedData = mapSourceToModel(mapping);

        if (
          !mappedData.id ||
          !mappedData.artistId ||
          !mappedData.trackId ||
          !mappedData.role
        ) {
          console.warn(
            `⚠️  Skipping mapping with missing required fields:`,
            mappedData,
          );
          continue;
        }

        // Use upsert to handle conflicts on composite primary key
        await TrackArtistMappingModel.upsert(mappedData as any, {
          conflictFields: ["id", "artistId", "trackId", "role"],
        });

        successCount++;

        if (successCount % 100 === 0) {
          console.log(`⏳ Migrated ${successCount} mappings...`);
        }
      } catch (err: any) {
        errorCount++;
        console.error(`❌ Error migrating mapping ${mapping.id}:`, err.message);
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

migrateTrackArtistMappings();

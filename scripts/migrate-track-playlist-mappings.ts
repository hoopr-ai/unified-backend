import { Client } from "pg";
import { Sequelize } from "sequelize-typescript";
import {
  PlaylistModel,
  TrackPlaylistMappingModel,
} from "../services/persistence-service/playlists/modules.export";
import { TrackModel } from "../services/persistence-service/track/modules.export";

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
  username: "select-server-dev",
  password: "hO82GcLotttB5bLyoeG1",
  database: "sage_staging",
};

// Fields mapping from source to target
const MAPPING_FIELDS = ["id", "playlistId", "trackId", "rank"] as const;

function mapSourceToModel(
  sourceMapping: any,
): Partial<TrackPlaylistMappingModel> {
  const mapped: Record<string, any> = {};

  for (const field of MAPPING_FIELDS) {
    const sourceValue = sourceMapping[field];

    if (sourceValue === undefined) {
      continue;
    }

    mapped[field] = sourceValue;
  }

  return mapped as Partial<TrackPlaylistMappingModel>;
}

async function migrateTrackPlaylistMappings() {
  const sourceClient = new Client(SOURCE_DB_CONFIG);

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

  // Register models with this Sequelize instance
  targetSequelize.addModels([PlaylistModel, TrackModel, TrackPlaylistMappingModel]);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database");

    await targetSequelize.authenticate();
    console.log("✅ Connected to target database");

    // Fetch all mappings from source table
    const { rows: mappings } = await sourceClient.query(
      `SELECT * FROM track_playlist_mappings`,
    );
    console.log(`📦 Found ${mappings.length} track-playlist mappings to migrate`);

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

        if (!mappedData.id) {
          console.warn(
            `⚠️  Skipping mapping with missing id:`,
            mappedData,
          );
          continue;
        }

        // Use upsert to handle conflicts on primary key
        await TrackPlaylistMappingModel.upsert(mappedData as any, {
          conflictFields: ["id"],
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

migrateTrackPlaylistMappings();

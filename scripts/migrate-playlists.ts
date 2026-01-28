import { Client } from "pg";
import { Sequelize } from "sequelize-typescript";
import { PlaylistModel } from "../services/persistence-service/playlists/modules.export";
import { PlaylistType } from "../services/dto-service/playlists/playlist.enum";

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

// Fields that exist in PlaylistModel (from playlist.schema.ts)
const PLAYLIST_MODEL_FIELDS = [
  "id",
  "playlistCode",
  "name",
  "description",
  "type",
  "playlistType",
  "name_slug",
  "partnerId",
  "status",
  "createdAt",
  "updatedAt",
] as const;

// Fields that need uppercase conversion
const UPPERCASE_FIELDS = ["type", "playlistType"];

function mapSourcePlaylistToModel(sourcePlaylist: any): Partial<PlaylistModel> {
  const mappedPlaylist: Record<string, any> = {};

  for (const field of PLAYLIST_MODEL_FIELDS) {
    const sourceValue = sourcePlaylist[field];

    // Skip if field doesn't exist in source
    if (sourceValue === undefined) {
      continue;
    }

    // Handle uppercase fields (type, playlistType)
    if (UPPERCASE_FIELDS.includes(field) && sourceValue) {
      mappedPlaylist[field] = String(sourceValue).toUpperCase();
      continue;
    }

    // Pass through other fields
    mappedPlaylist[field] = sourceValue;
  }

  // Always set status to ACTIVE (uppercase)
  mappedPlaylist["status"] = "ACTIVE";

  // // Default playlistType to SYSTEM if not present in source
  // if (mappedPlaylist.type) {
  //   mappedPlaylist.type = PlaylistType.SYSTEM;
  // }

  // mappedPlaylist.playlistType = "PLAYLIST";

  return mappedPlaylist as Partial<PlaylistModel>;
}

async function migratePlaylists() {
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

  // Register PlaylistModel with this Sequelize instance
  targetSequelize.addModels([PlaylistModel]);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database (select_staging)");

    await targetSequelize.authenticate();
    console.log("✅ Connected to target database (unified_staging)");

    // Fetch all playlists from source
    const { rows: playlists } = await sourceClient.query(
      `SELECT * FROM playlists`,
    );
    console.log(`📦 Found ${playlists.length} playlists to migrate`);

    if (playlists.length === 0) {
      console.log("No playlists to migrate");
      return;
    }

    // Log fields that will be skipped
    if (playlists.length > 0) {
      const sourceFields = Object.keys(playlists[0]);
      const skippedFields = sourceFields.filter(
        (f) => !PLAYLIST_MODEL_FIELDS.includes(f as any),
      );
      if (skippedFields.length > 0) {
        console.log(
          `⚠️  Skipping fields not in PlaylistModel: ${skippedFields.join(", ")}`,
        );
      }
    }

    let successCount = 0;
    let errorCount = 0;

    for (const playlist of playlists) {
      try {
        const mappedPlaylist = mapSourcePlaylistToModel(playlist);

        // Ensure id is present for upsert
        if (!mappedPlaylist.id) {
          console.warn(`⚠️  Skipping playlist with missing id`);
          continue;
        }

        // Use upsert to handle conflicts on id
        await PlaylistModel.upsert(mappedPlaylist as any, {
          conflictFields: ["id"],
        });

        successCount++;

        if (successCount % 100 === 0) {
          console.log(`⏳ Migrated ${successCount} playlists...`);
        }
      } catch (err: any) {
        errorCount++;
        console.error(
          `❌ Error migrating playlist ${playlist.id}:`,
          err.message,
        );
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

migratePlaylists();

import { Client } from "pg";
import { Sequelize } from "sequelize-typescript";
import { AlbumModel } from "../services/persistence-service/albums/schemas/album.schema";

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

// Fields that exist in AlbumModel (excluding trackId — built from source tracks)
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
): Partial<AlbumModel> {
  const mapped: Record<string, any> = {};

  for (const field of ALBUM_MODEL_FIELDS) {
    const value = sourceAlbum[field];
    if (value === undefined) continue;
    mapped[field] = value;
  }

  // ⚠️ Key transform: old albumId in tracks → new trackId[] in albums
  mapped["trackId"] = trackIds.length > 0 ? trackIds : null;

  return mapped as Partial<AlbumModel>;
}

async function migrateAlbums() {
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

  targetSequelize.addModels([AlbumModel]);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database");

    await targetSequelize.authenticate();
    console.log("✅ Connected to target database");

    // ============ STEP 1: Build albumId → trackId[] map from source tracks ============
    console.log("\n📦 Fetching tracks with albumId from source...");
    const { rows: tracksWithAlbum } = await sourceClient.query(
      `SELECT id, "albumId" FROM tracks WHERE "albumId" IS NOT NULL`,
    );
    console.log(`📦 Found ${tracksWithAlbum.length} tracks with albumId`);

    // Group trackIds by albumId
    const albumTrackMap = new Map<string, string[]>();
    for (const track of tracksWithAlbum) {
      const albumId = track.albumId;
      const trackId = track.id;
      if (!albumTrackMap.has(albumId)) {
        albumTrackMap.set(albumId, []);
      }
      albumTrackMap.get(albumId)!.push(trackId);
    }
    console.log(`📦 Mapped tracks across ${albumTrackMap.size} albums`);

    // ============ STEP 2: Fetch all albums from source ============
    console.log("\n📦 Fetching albums from source...");
    const { rows: albums } = await sourceClient.query(`SELECT * FROM albums`);
    console.log(`📦 Found ${albums.length} albums to migrate`);

    if (albums.length === 0) {
      console.log("No albums to migrate.");
      return;
    }

    // Log skipped fields
    const sourceFields = Object.keys(albums[0]);
    const skippedFields = sourceFields.filter(
      (f) => !ALBUM_MODEL_FIELDS.includes(f as any),
    );
    if (skippedFields.length > 0) {
      console.log(
        `⚠️  Skipping fields not in AlbumModel: ${skippedFields.join(", ")}`,
      );
    }

    // ============ STEP 3: Upsert albums into target with trackId[] ============
    console.log("\n📦 Migrating albums to target...");
    let successCount = 0;
    let errorCount = 0;
    let noTracksCount = 0;

    for (const album of albums) {
      try {
        if (!album.id) {
          console.warn(`⚠️  Skipping album with missing id`);
          continue;
        }

        const trackIds = albumTrackMap.get(album.id) || [];
        if (trackIds.length === 0) {
          noTracksCount++;
        }

        const mappedAlbum = mapSourceAlbumToModel(album, trackIds);

        await AlbumModel.upsert(mappedAlbum as any, {
          conflictFields: ["id"],
        });

        successCount++;

        if (successCount % 100 === 0) {
          console.log(`⏳ Migrated ${successCount} albums...`);
        }
      } catch (err: any) {
        errorCount++;
        console.error(`❌ Error migrating album ${album.id}:`, err.message);
      }
    }

    console.log(
      `\n✅ Albums migration complete: ${successCount} succeeded, ${errorCount} failed`,
    );
    if (noTracksCount > 0) {
      console.log(
        `ℹ️  ${noTracksCount} albums had no associated tracks (trackId set to null)`,
      );
    }
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await sourceClient.end();
    await targetSequelize.close();
  }
}

migrateAlbums();

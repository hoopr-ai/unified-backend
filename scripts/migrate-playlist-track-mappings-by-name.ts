import { Client } from "pg";
import { v4 as uuidv4 } from "uuid";

// ============ SOURCE DATABASE ============
const SOURCE_DB_CONFIG = {
  host: "34.47.193.1",
  port: 5432,
  user: "hoopr-server",
  password: "Sz6J8J77X2VFuHd9GzR3",
  database: "production",
};

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  host: "34.47.153.109",
  port: 5432,
  user: "unified-prod",
  password: 'X"E6o+`{yvN|c30R',
  database: "unified-backend-prod",
  ssl: { rejectUnauthorized: false },
};

async function migratePlaylistTrackMappingsByName() {
  const sourceClient = new Client(SOURCE_DB_CONFIG);
  const targetClient = new Client(TARGET_DB_CONFIG);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database");

    await targetClient.connect();
    console.log("✅ Connected to target database");

    // Fetch all mappings for EDITORIAL playlists from source,
    // joining track name and playlist id
    const { rows: sourceMappings } = await sourceClient.query(`
      SELECT
        tpm."playlistId",
        tpm.rank,
        t.name AS track_name
      FROM track_playlist_mappings tpm
      JOIN tracks t ON t.id = tpm."trackId"
      JOIN playlists p ON p.id = tpm."playlistId"
      WHERE p.type = 'editorial'
    `);

    console.log(`📦 Found ${sourceMappings.length} source mappings for EDITORIAL playlists`);

    if (sourceMappings.length === 0) {
      console.log("Nothing to migrate.");
      return;
    }

    // Build a name → trackId map from target tracks (lowercase for safe matching)
    const { rows: targetTracks } = await targetClient.query(
      `SELECT id, name FROM tracks`,
    );

    const trackNameToId = new Map<string, string>();
    for (const track of targetTracks) {
      if (track.name) {
        trackNameToId.set(track.name.trim().toLowerCase(), track.id);
      }
    }

    console.log(`🗂  Loaded ${trackNameToId.size} tracks from target for name lookup`);

    let successCount = 0;
    let skippedNoTrack = 0;
    let skippedNoPlaylist = 0;
    let errorCount = 0;

    for (const mapping of sourceMappings) {
      try {
        const trackId = trackNameToId.get(mapping.track_name?.trim().toLowerCase());

        if (!trackId) {
          skippedNoTrack++;
          if (skippedNoTrack <= 10) {
            console.warn(`⚠️  Track not found in target by name: "${mapping.track_name}"`);
          }
          continue;
        }

        // Verify the playlist exists in target (it should — migrated with same UUID)
        const { rows: playlistRows } = await targetClient.query(
          `SELECT id FROM playlists WHERE id = $1`,
          [mapping.playlistId],
        );

        if (playlistRows.length === 0) {
          skippedNoPlaylist++;
          if (skippedNoPlaylist <= 10) {
            console.warn(`⚠️  Playlist not found in target: ${mapping.playlistId}`);
          }
          continue;
        }

        // Insert mapping — skip if (playlistId, trackId) already exists
        await targetClient.query(
          `INSERT INTO track_playlist_mappings (id, "trackId", "playlistId", rank)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ("playlistId", "trackId") DO NOTHING`,
          [uuidv4(), trackId, mapping.playlistId, mapping.rank ?? null],
        );

        successCount++;

        if (successCount % 100 === 0) {
          console.log(`⏳ Inserted ${successCount} mappings...`);
        }
      } catch (err: any) {
        errorCount++;
        console.error(`❌ Error on track "${mapping.track_name}":`, err.message);
      }
    }

    console.log(`\n✅ Done`);
    console.log(`   Inserted:              ${successCount}`);
    console.log(`   Skipped (no track):    ${skippedNoTrack}`);
    console.log(`   Skipped (no playlist): ${skippedNoPlaylist}`);
    console.log(`   Errors:                ${errorCount}`);
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

migratePlaylistTrackMappingsByName();

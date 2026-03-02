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

async function fixTrackRelationships() {
  const sourceClient = new Client(SOURCE_DB_CONFIG);
  const targetClient = new Client(TARGET_DB_CONFIG);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database");

    await targetClient.connect();
    console.log("✅ Connected to target database");

    // ============ STEP 1: Get all track IDs from target ============
    console.log("\n📦 Fetching all track IDs from target DB...");
    const { rows: targetTracks } = await targetClient.query(
      `SELECT id, "ownerId" FROM tracks`,
    );
    console.log(`📦 Found ${targetTracks.length} tracks in target DB`);

    if (targetTracks.length === 0) {
      console.log("⚠️  No tracks in target DB. Nothing to fix.");
      return;
    }

    const allTrackIds = targetTracks.map((t: any) => t.id as string);

    // ============ STEP 2: Collect all ownerIds from target tracks ============
    const allOwnerIds: string[] = [];
    for (const track of targetTracks) {
      const raw = track.ownerId;
      if (!raw) continue;
      const ids: string[] = Array.isArray(raw)
        ? raw
        : String(raw)
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
      allOwnerIds.push(...ids);
    }
    const uniqueOwnerIds = [...new Set(allOwnerIds)];
    console.log(
      `📦 Found ${uniqueOwnerIds.length} unique owner IDs across all tracks`,
    );

    // ============ STEP 3: Re-upsert owners with full fields from source ============
    if (uniqueOwnerIds.length > 0) {
      console.log(
        "\n📦 Re-upserting owners with full fields (type, subType, ownerCode, etc.)...",
      );

      const BATCH_SIZE = 500;
      let ownerSuccess = 0;
      let ownerError = 0;

      for (let i = 0; i < uniqueOwnerIds.length; i += BATCH_SIZE) {
        const batch = uniqueOwnerIds.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(", ");

        const { rows: owners } = await sourceClient.query(
          `SELECT * FROM owners WHERE id IN (${placeholders})`,
          batch,
        );

        for (const owner of owners) {
          try {
            if (!owner.id) continue;
            const data: Record<string, any> = {};
            for (const [k, v] of Object.entries(owner)) {
              if (v !== undefined && v !== null) data[k] = v;
            }
            const keys = Object.keys(data);
            const values = Object.values(data);
            const cols = keys.map((k) => `"${k}"`).join(", ");
            const params = keys.map((_, idx) => `$${idx + 1}`).join(", ");
            const updates = keys
              .filter((k) => k !== "id")
              .map((k) => `"${k}" = EXCLUDED."${k}"`)
              .join(", ");
            await targetClient.query(
              `INSERT INTO "owners" (${cols}) VALUES (${params}) ON CONFLICT ("id") DO UPDATE SET ${updates}`,
              values,
            );
            ownerSuccess++;
          } catch (err: any) {
            ownerError++;
            console.error(`❌ Error upserting owner ${owner.id}:`, err.message);
          }
        }
      }

      console.log(`✅ Owners: ${ownerSuccess} succeeded, ${ownerError} failed`);
    }

    // ============ STEP 4: Migrate artists referenced by all track mappings ============
    console.log("\n📦 Collecting all artistIds from source track-artist mappings...");

    const TRACK_BATCH_SIZE = 1000;
    const allArtistIds: string[] = [];

    for (let i = 0; i < allTrackIds.length; i += TRACK_BATCH_SIZE) {
      const batch = allTrackIds.slice(i, i + TRACK_BATCH_SIZE);
      const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(", ");
      const { rows: mappingRows } = await sourceClient.query(
        `SELECT DISTINCT "artistId" FROM artist_track_role_mappings WHERE "trackId" IN (${placeholders})`,
        batch,
      );
      allArtistIds.push(...mappingRows.map((r: any) => r.artistId).filter(Boolean));
    }

    const uniqueArtistIds = [...new Set(allArtistIds)];
    console.log(`📦 Found ${uniqueArtistIds.length} unique artists to upsert`);

    let artistUpsertSuccess = 0;
    let artistUpsertError = 0;
    const ARTIST_BATCH_SIZE = 500;

    for (let i = 0; i < uniqueArtistIds.length; i += ARTIST_BATCH_SIZE) {
      const batch = uniqueArtistIds.slice(i, i + ARTIST_BATCH_SIZE);
      const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(", ");
      const { rows: artists } = await sourceClient.query(
        `SELECT * FROM artists WHERE id IN (${placeholders})`,
        batch,
      );
      // Columns that exist in target artists table (from ArtistModel schema)
      const TARGET_ARTIST_COLS = new Set([
        "id", "name", "artistCode", "type", "originRegion", "name_slug",
        "instagramLink", "spotifyLink", "status", "pastIds", "createdAt", "updatedAt",
      ]);

      for (const artist of artists) {
        try {
          if (!artist.id) continue;
          const data: Record<string, any> = {};
          for (const [k, v] of Object.entries(artist)) {
            if (v === undefined || v === null) continue;
            // Skip columns that don't exist in target schema
            if (!TARGET_ARTIST_COLS.has(k)) continue;
            // Convert type from comma-separated string to array if needed
            if (k === "type") {
              data[k] = Array.isArray(v)
                ? v
                : String(v).split(",").map((s: string) => s.trim()).filter(Boolean);
              continue;
            }
            data[k] = v;
          }
          if (Object.keys(data).length === 0) continue;
          const keys = Object.keys(data);
          const cols = keys.map((k) => `"${k}"`).join(", ");
          const params = keys.map((_, idx) => `$${idx + 1}`).join(", ");
          const updates = keys
            .map((k) => `"${k}" = EXCLUDED."${k}"`)
            .join(", ");
          await targetClient.query(
            `INSERT INTO "artists" (${cols}) VALUES (${params}) ON CONFLICT ("artistCode") DO UPDATE SET ${updates}`,
            Object.values(data),
          );
          artistUpsertSuccess++;
        } catch (err: any) {
          artistUpsertError++;
          console.error(`❌ Error upserting artist ${artist.id}:`, err.message);
        }
      }
    }

    console.log(`✅ Artists: ${artistUpsertSuccess} succeeded, ${artistUpsertError} failed`);

    // ============ STEP 5: Re-migrate artist mappings for all tracks ============
    console.log("\n📦 Re-migrating artist mappings for all tracks...");


    let artistSuccess = 0;
    let artistError = 0;

    for (let i = 0; i < allTrackIds.length; i += TRACK_BATCH_SIZE) {
      const batch = allTrackIds.slice(i, i + TRACK_BATCH_SIZE);
      const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(", ");

      const { rows: artistMappings } = await sourceClient.query(
        `SELECT * FROM artist_track_role_mappings WHERE "trackId" IN (${placeholders})`,
        batch,
      );

      for (const mapping of artistMappings) {
        try {
          if (
            !mapping.id ||
            !mapping.artistId ||
            !mapping.trackId ||
            !mapping.role
          ) {
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
          const params = keys.map((_, idx) => `$${idx + 1}`).join(", ");
          await targetClient.query(
            `INSERT INTO "track_artist_mappings" (${cols}) VALUES (${params}) ON CONFLICT DO NOTHING`,
            Object.values(data),
          );
          artistSuccess++;
        } catch (err: any) {
          artistError++;
          console.error(
            `❌ Error inserting artist mapping ${mapping.id}:`,
            err.message,
          );
        }
      }

      if (i + TRACK_BATCH_SIZE < allTrackIds.length) {
        console.log(
          `⏳ Processed artist mappings for ${i + TRACK_BATCH_SIZE} / ${allTrackIds.length} tracks...`,
        );
      }
    }

    console.log(
      `✅ Artist mappings: ${artistSuccess} succeeded, ${artistError} failed`,
    );

    // ============ STEP 6: Re-migrate filter mappings for all tracks ============
    console.log("\n📦 Re-migrating filter mappings for all tracks...");

    let filterSuccess = 0;
    let filterError = 0;

    for (let i = 0; i < allTrackIds.length; i += TRACK_BATCH_SIZE) {
      const batch = allTrackIds.slice(i, i + TRACK_BATCH_SIZE);
      const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(", ");

      const { rows: filterMappings } = await sourceClient.query(
        `SELECT * FROM track_filter_mappings WHERE "trackId" IN (${placeholders})`,
        batch,
      );

      for (const mapping of filterMappings) {
        try {
          if (!mapping.id) continue;
          const data = {
            id: mapping.id,
            filterId: mapping.filterId,
            trackId: mapping.trackId,
          };
          const keys = Object.keys(data);
          const cols = keys.map((k) => `"${k}"`).join(", ");
          const params = keys.map((_, idx) => `$${idx + 1}`).join(", ");
          await targetClient.query(
            `INSERT INTO "track_filter_mappings" (${cols}) VALUES (${params}) ON CONFLICT DO NOTHING`,
            Object.values(data),
          );
          filterSuccess++;
        } catch (err: any) {
          filterError++;
          console.error(
            `❌ Error inserting filter mapping ${mapping.id}:`,
            err.message,
          );
        }
      }

      if (i + TRACK_BATCH_SIZE < allTrackIds.length) {
        console.log(
          `⏳ Processed filter mappings for ${i + TRACK_BATCH_SIZE} / ${allTrackIds.length} tracks...`,
        );
      }
    }

    console.log(
      `✅ Filter mappings: ${filterSuccess} succeeded, ${filterError} failed`,
    );

    console.log(
      "\n✅ All done! Artist mappings, filter mappings, and owner fields have been repaired.",
    );
  } catch (err) {
    console.error("❌ Fix script failed:", err);
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

fixTrackRelationships();

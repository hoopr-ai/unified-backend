import { Client } from "pg";

function toStringArray(value: string | null): string[] | null {
  if (!value) return null;

  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean); // removes empty strings
}

function toJsonbStrict(value: any): object | null {
  if (value === null || value === undefined) return null;

  // Already safe
  if (typeof value === "object") return value;

  if (typeof value === "string") {
    const trimmed = value.trim();

    // Empty or obviously broken JSON
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
      // DO NOT pass string to JSONB
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
  user: "select-server-dev",
  password: "hO82GcLotttB5bLyoeG1",
  database: "sage_staging",
};

async function migrateTracks() {
  const sourceClient = new Client(SOURCE_DB_CONFIG);
  const targetClient = new Client(TARGET_DB_CONFIG);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database (select_staging)");

    await targetClient.connect();
    console.log("✅ Connected to target database (unified_staging)");

    // Fetch all tracks from source
    const { rows: tracks } = await sourceClient.query(`SELECT * FROM tracks`);
    console.log(`📦 Found ${tracks.length} tracks to migrate`);

    if (tracks.length === 0) {
      console.log("No tracks to migrate");
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const track of tracks) {
      try {
        // Convert single values to arrays for the modified columns
        const songKey = toStringArray(track.songKey);
        const displayTags = toStringArray(track.displayTags);
        const ownerId = toStringArray(track.ownerId);
        const publisherId = toStringArray(track.publisherId);

        await targetClient.query(
          `INSERT INTO tracks (
            id, "trackCode", type, name, description, duration, size, bpm,
            "songKey", "timeSignature", region, "releaseRegion", "releaseDate",
            "releaseYear", "albumId", "ownerId", "imageId", "hasVocals", "isPRO",
            name_slug, payload, "isExplicit", "displayTags", error, "sourceLink",
            "artLink", "imageUrl", "waveformLink", "mp3Link", "isProcessed",
            "ISRC", lyrics, tier, energy, industry, active, deleted,
            "createdAt", "updatedAt", released, "publisherId", trending, premium,
            "reelCount", "partnerId", bollywood
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
            $41, $42, $43, $44, $45, $46
          )
          ON CONFLICT (id) DO UPDATE SET
            "trackCode" = EXCLUDED."trackCode",
            type = EXCLUDED.type,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            duration = EXCLUDED.duration,
            size = EXCLUDED.size,
            bpm = EXCLUDED.bpm,
            "songKey" = EXCLUDED."songKey",
            "timeSignature" = EXCLUDED."timeSignature",
            region = EXCLUDED.region,
            "releaseRegion" = EXCLUDED."releaseRegion",
            "releaseDate" = EXCLUDED."releaseDate",
            "releaseYear" = EXCLUDED."releaseYear",
            "albumId" = EXCLUDED."albumId",
            "ownerId" = EXCLUDED."ownerId",
            "imageId" = EXCLUDED."imageId",
            "hasVocals" = EXCLUDED."hasVocals",
            "isPRO" = EXCLUDED."isPRO",
            name_slug = EXCLUDED.name_slug,
            payload = EXCLUDED.payload,
            "isExplicit" = EXCLUDED."isExplicit",
            "displayTags" = EXCLUDED."displayTags",
            error = EXCLUDED.error,
            "sourceLink" = EXCLUDED."sourceLink",
            "artLink" = EXCLUDED."artLink",
            "imageUrl" = EXCLUDED."imageUrl",
            "waveformLink" = EXCLUDED."waveformLink",
            "mp3Link" = EXCLUDED."mp3Link",
            "isProcessed" = EXCLUDED."isProcessed",
            "ISRC" = EXCLUDED."ISRC",
            lyrics = EXCLUDED.lyrics,
            tier = EXCLUDED.tier,
            energy = EXCLUDED.energy,
            industry = EXCLUDED.industry,
            active = EXCLUDED.active,
            deleted = EXCLUDED.deleted,
            "updatedAt" = EXCLUDED."updatedAt",
            released = EXCLUDED.released,
            "publisherId" = EXCLUDED."publisherId",
            trending = EXCLUDED.trending,
            premium = EXCLUDED.premium,
            "reelCount" = EXCLUDED."reelCount",
            "partnerId" = EXCLUDED."partnerId",
            bollywood = EXCLUDED.bollywood`,
          [
            track.id,
            track.trackCode,
            track.type,
            track.name,
            track.description,
            track.duration,
            track.size,
            track.bpm,
            songKey,
            track.timeSignature,
            track.region,
            track.releaseRegion,
            track.releaseDate,
            track.releaseYear,
            track.albumId,
            ownerId,
            track.imageId,
            track.hasVocals,
            track.isPRO,
            track.name_slug,
            track.payload,
            track.isExplicit,
            displayTags,
            track.error,
            track.sourceLink,
            track.artLink,
            track.imageUrl,
            track.waveformLink,
            track.mp3Link,
            track.isProcessed,
            track.ISRC,
            track.lyrics,
            track.tier,
            track.energy,
            toJsonbStrict(track.industry),
            track.active,
            track.deleted,
            track.createdAt,
            track.updatedAt,
            track.released,
            publisherId,
            track.trending,
            track.premium,
            track.reelCount,
            track.partnerId,
            track.bollywood,
          ],
        );
        successCount++;

        if (successCount % 100 === 0) {
          console.log(`⏳ Migrated ${successCount} tracks...`);
        }
      } catch (err: any) {
        errorCount++;
        console.error(`❌ Error migrating track ${track.id}:`, err);
      }
    }

    console.log(
      `\n✅ Migration complete: ${successCount} succeeded, ${errorCount} failed`,
    );
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

migrateTracks();

import "dotenv/config";
import { sequelize } from "../services/persistence-service/database";
import {
  countNativeArtists,
  recomputeNativeArtistFlags,
} from "../services/persistence-service/artists/modules.export";

// ---------------------------------------------------------------------------
// One-time backfill for artists."nativeArtist", after
// scripts/migration-add-native-artist-flag.sql has added the column.
//
//   npx tsx scripts/backfill-native-artist-flag.ts
//   npx tsx scripts/backfill-native-artist-flag.ts --promote   # cheap half
//
// Targets whatever .env points at. To run it against staging instead, export
// the DB_* vars first — dotenv never overwrites variables already in the
// environment, so the shell wins.
//
// Runs the FULL recompute by default (both directions) — the migration defaults
// every row to false, so the first run is all promotions anyway, and after that
// this is the script to reach for when the flag is suspected of being stale.
// The nightly cron does the promote-only half; see artist.persistence.service.
//
// It does NOT call connectDatabase(): that would run sequelize.sync() when
// DB_SYNC=true, and a backfill has no business creating tables.
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const mode = process.argv.includes("--promote") ? "promote" : "full";

  await sequelize.authenticate();
  const before = await countNativeArtists();
  console.log(
    `Before: ${before.nativeTotal} native of ${before.total} artists.`,
  );

  const result = await recomputeNativeArtistFlags(mode);
  console.log(
    `${result.mode} recompute: +${result.promoted} promoted, -${result.demoted} demoted in ${result.durationMs}ms.`,
  );

  const after = await countNativeArtists();
  console.log(`After:  ${after.nativeTotal} native of ${after.total} artists.`);
};

main()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Backfill failed:", error);
    await sequelize.close();
    process.exit(1);
  });

import { Sequelize } from "sequelize-typescript";

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  host: "34.47.153.109",
  port: 5432,
  username: "unified-prod",
  password: 'X"E6o+`{yvN|c30R',
  database: "unified-backend-prod",
};

async function fixPlaylistCodes() {
  const sequelize = new Sequelize({
    dialect: "postgres",
    host: TARGET_DB_CONFIG.host,
    port: TARGET_DB_CONFIG.port,
    username: TARGET_DB_CONFIG.username,
    password: TARGET_DB_CONFIG.password,
    database: TARGET_DB_CONFIG.database,
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
    define: { freezeTableName: true, timestamps: true },
  });

  try {
    await sequelize.authenticate();
    console.log("✅ Connected to target database");

    // Find current max numeric playlistCode across ALL playlists
    const [maxRows] = await sequelize.query(
      `SELECT MAX("playlistCode"::int) AS max FROM playlists
       WHERE "playlistCode" ~ '^[0-9]+$'`,
    ) as [Array<{ max: number | null }>, unknown];

    let nextNum = maxRows[0]?.max != null ? maxRows[0].max + 1 : 1;
    console.log(`📋 Starting from playlistCode: ${nextNum}`);

    // Get EDITORIAL playlists with non-numeric or NULL playlistCode, ordered by createdAt
    const [toFix] = await sequelize.query(
      `SELECT id, "playlistCode", name FROM playlists
       WHERE type = 'SYSTEM'
         AND ("playlistCode" IS NULL OR "playlistCode" !~ '^[0-9]+$')
       ORDER BY "createdAt" ASC`,
    ) as [Array<{ id: string; playlistCode: string | null; name: string }>, unknown];

    console.log(`📋 ${toFix.length} SYSTEM playlists need a new playlistCode`);

    if (toFix.length === 0) {
      console.log("Nothing to fix.");
      return;
    }

    let fixCount = 0;
    for (const row of toFix) {
      await sequelize.query(
        `UPDATE playlists SET "playlistCode" = :code WHERE id = :id`,
        { replacements: { code: String(nextNum), id: row.id } },
      );
      console.log(`  ${row.playlistCode ?? "NULL"} → ${nextNum}  (${row.name})`);
      nextNum++;
      fixCount++;
    }

    console.log(`\n✅ Fixed ${fixCount} playlistCodes. Next available: ${nextNum}`);
  } catch (err) {
    console.error("❌ Failed:", err);
  } finally {
    await sequelize.close();
  }
}

fixPlaylistCodes();

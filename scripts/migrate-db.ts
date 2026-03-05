import { Sequelize, QueryTypes } from "sequelize";
import { config } from "dotenv";

config();

// ============== CONFIGURATION ==============
const BATCH_SIZE = 1000; // Number of rows per batch
const TABLES_TO_SKIP: string[] = []; // Add table names to skip if needed

// Source Database Configuration
const SOURCE_DB = {
  host: process.env.SOURCE_DB_HOST || "",
  port: Number(process.env.SOURCE_DB_PORT) || 5432,
  username: process.env.SOURCE_DB_USER || "",
  password: process.env.SOURCE_DB_PASSWORD || "",
  database: process.env.SOURCE_DB_NAME || "",
};

// Target Database Configuration
const TARGET_DB = {
  host: process.env.TARGET_DB_HOST || "",
  port: Number(process.env.TARGET_DB_PORT) || 5432,
  username: process.env.TARGET_DB_USER || "",
  password: process.env.TARGET_DB_PASSWORD || "",
  database: process.env.TARGET_DB_NAME || "",
};

// ============== DATABASE CONNECTIONS ==============
function createConnection(dbConfig: typeof SOURCE_DB, name: string): Sequelize {
  return new Sequelize({
    dialect: "postgres",
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  });
}

// ============== HELPER FUNCTIONS ==============
async function getAllTables(sequelize: Sequelize): Promise<string[]> {
  const result = await sequelize.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    { type: QueryTypes.SELECT }
  );
  return result.map((row) => row.tablename);
}

async function getTableRowCount(
  sequelize: Sequelize,
  tableName: string
): Promise<number> {
  const result = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM "${tableName}"`,
    { type: QueryTypes.SELECT }
  );
  return parseInt(result[0].count, 10);
}

async function getTableColumns(
  sequelize: Sequelize,
  tableName: string
): Promise<string[]> {
  const result = await sequelize.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    { type: QueryTypes.SELECT, bind: [tableName] }
  );
  return result.map((row) => row.column_name);
}

async function getPrimaryKeyColumn(
  sequelize: Sequelize,
  tableName: string
): Promise<string | null> {
  const result = await sequelize.query<{ column_name: string }>(
    `SELECT a.attname as column_name
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = $1::regclass AND i.indisprimary`,
    { type: QueryTypes.SELECT, bind: [tableName] }
  );
  return result.length > 0 ? result[0].column_name : null;
}

async function fetchBatch(
  sequelize: Sequelize,
  tableName: string,
  offset: number,
  limit: number,
  orderByColumn: string
): Promise<Record<string, unknown>[]> {
  const result = await sequelize.query(
    `SELECT * FROM "${tableName}" ORDER BY "${orderByColumn}" LIMIT $1 OFFSET $2`,
    { type: QueryTypes.SELECT, bind: [limit, offset] }
  );
  return result as Record<string, unknown>[];
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    return `{${value.join(",")}}`;   // convert JS array → PG array
  }

  if (typeof value === "object" && !(value instanceof Date)) {
    return JSON.stringify(value);
  }

  return value;
}

async function getJsonColumns(
  sequelize: Sequelize,
  tableName: string
): Promise<Set<string>> {
  const result = await sequelize.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     AND data_type IN ('json', 'jsonb')`,
    { type: QueryTypes.SELECT, bind: [tableName] }
  );
  return new Set(result.map((row) => row.column_name));
}

async function insertBatch(
  sequelize: Sequelize,
  tableName: string,
  columns: string[],
  rows: Record<string, unknown>[],
  jsonColumns?: Set<string>
): Promise<void> {
  if (rows.length === 0) return;

  const quotedColumns = columns.map((col) => `"${col}"`).join(", ");
  const valuePlaceholders = rows
    .map(
      (_, rowIndex) =>
        `(${columns
          .map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`)
          .join(", ")})`
    )
    .join(", ");

  const values = rows.flatMap((row) =>
    columns.map((col) => {
      const value = row[col];
      // Stringify JSON columns if they're objects
      if (jsonColumns?.has(col) && value !== null && typeof value === "object") {
        return JSON.stringify(value);
      }
      return sanitizeValue(value);
    })
  );

  const query = `
    INSERT INTO "${tableName}" (${quotedColumns})
    VALUES ${valuePlaceholders}
    ON CONFLICT DO NOTHING
  `;

  await sequelize.query(query, { type: QueryTypes.INSERT, bind: values });
}

async function disableAllConstraints(sequelize: Sequelize): Promise<void> {
  // Using session_replication_role bypasses all triggers and FK checks
  // This requires the user to have replication privileges or be superuser
  // Fallback: try to set it, if it fails we'll handle per-table
  try {
    await sequelize.query(`SET session_replication_role = 'replica'`);
    console.log("   ✅ Disabled all constraints (session_replication_role = replica)");
  } catch (error) {
    console.log("   ⚠️  Could not set session_replication_role, will try per-table triggers");
    throw error;
  }
}

async function enableAllConstraints(sequelize: Sequelize): Promise<void> {
  await sequelize.query(`SET session_replication_role = 'origin'`);
  console.log("   ✅ Re-enabled all constraints");
}

async function disableTriggers(
  sequelize: Sequelize,
  tableName: string
): Promise<void> {
  // Only disable USER triggers, not system triggers (FK constraints)
  await sequelize.query(`ALTER TABLE "${tableName}" DISABLE TRIGGER USER`);
}

async function enableTriggers(
  sequelize: Sequelize,
  tableName: string
): Promise<void> {
  await sequelize.query(`ALTER TABLE "${tableName}" ENABLE TRIGGER USER`);
}

async function checkTableExists(
  sequelize: Sequelize,
  tableName: string
): Promise<boolean> {
  const result = await sequelize.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    )`,
    { type: QueryTypes.SELECT, bind: [tableName] }
  );
  return result[0].exists;
}

async function getCommonColumns(
  sourceDb: Sequelize,
  targetDb: Sequelize,
  tableName: string
): Promise<{ common: string[]; missingInTarget: string[] }> {
  const sourceColumns = await getTableColumns(sourceDb, tableName);
  const targetColumns = await getTableColumns(targetDb, tableName);
  const targetColumnsSet = new Set(targetColumns);

  const common = sourceColumns.filter(col => targetColumnsSet.has(col));
  const missingInTarget = sourceColumns.filter(col => !targetColumnsSet.has(col));

  return { common, missingInTarget };
}

// ============== MAIN MIGRATION FUNCTION ==============
async function migrateTable(
  sourceDb: Sequelize,
  targetDb: Sequelize,
  tableName: string,
  useReplicationRole: boolean
): Promise<{ success: boolean; rowsMigrated: number; error?: string; skippedColumns?: string[] }> {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`📦 Starting migration for table: ${tableName}`);
  console.log(`${"=".repeat(50)}`);

  try {
    // Check if table exists in target
    const tableExists = await checkTableExists(targetDb, tableName);
    if (!tableExists) {
      console.log(`   ⏭️  Skipping - table does not exist in target database`);
      return { success: false, rowsMigrated: 0, error: `relation "${tableName}" does not exist` };
    }

    // Get row count from source
    const totalRows = await getTableRowCount(sourceDb, tableName);
    console.log(`   Total rows in source: ${totalRows}`);

    if (totalRows === 0) {
      console.log(`   ⏭️  Skipping - no data to migrate`);
      return { success: true, rowsMigrated: 0 };
    }

    // Get common columns between source and target
    const { common: columns, missingInTarget } = await getCommonColumns(sourceDb, targetDb, tableName);
    console.log(`   Columns to migrate: ${columns.length}`);

    if (missingInTarget.length > 0) {
      console.log(`   ⚠️  Skipping columns not in target: ${missingInTarget.join(", ")}`);
    }

    if (columns.length === 0) {
      console.log(`   ⏭️  Skipping - no common columns between source and target`);
      return { success: false, rowsMigrated: 0, error: "No common columns" };
    }

    // Get primary key for ordering
    const primaryKey = await getPrimaryKeyColumn(sourceDb, tableName);
    const orderByColumn = primaryKey || columns[0];
    console.log(`   Order by: ${orderByColumn}`);

    // Get JSON columns for proper serialization
    const jsonColumns = await getJsonColumns(targetDb, tableName);
    if (jsonColumns.size > 0) {
      console.log(`   JSON columns: ${[...jsonColumns].join(", ")}`);
    }

    // Disable triggers on target if not using replication role
    if (!useReplicationRole) {
      try {
        await disableTriggers(targetDb, tableName);
      } catch (e) {
        // Ignore trigger disable errors, continue anyway
      }
    }

    // Migrate in batches
    let offset = 0;
    let migratedCount = 0;
    const totalBatches = Math.ceil(totalRows / BATCH_SIZE);

    while (offset < totalRows) {
      const currentBatch = Math.floor(offset / BATCH_SIZE) + 1;
      process.stdout.write(
        `\r   📤 Migrating batch ${currentBatch}/${totalBatches} (${migratedCount}/${totalRows} rows)`
      );

      // Fetch batch from source (fetch all columns, but we'll only insert common ones)
      const rows = await fetchBatch(
        sourceDb,
        tableName,
        offset,
        BATCH_SIZE,
        orderByColumn
      );

      if (rows.length === 0) break;

      // Insert batch into target using only common columns
      await insertBatch(targetDb, tableName, columns, rows, jsonColumns);

      migratedCount += rows.length;
      offset += BATCH_SIZE;
    }

    // Re-enable triggers if not using replication role
    if (!useReplicationRole) {
      try {
        await enableTriggers(targetDb, tableName);
      } catch (e) {
        // Ignore trigger enable errors
      }
    }

    console.log(`\n   ✅ Completed: ${migratedCount} rows migrated`);
    return {
      success: true,
      rowsMigrated: migratedCount,
      skippedColumns: missingInTarget.length > 0 ? missingInTarget : undefined
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`\n   ❌ Error: ${errorMessage}`);
    return { success: false, rowsMigrated: 0, error: errorMessage };
  }
}

async function main() {
  console.log("🚀 Database Migration Script");
  console.log("============================\n");

  // Validate configuration
  const missingSource = Object.entries(SOURCE_DB)
    .filter(([_, v]) => !v)
    .map(([k]) => k);
  const missingTarget = Object.entries(TARGET_DB)
    .filter(([_, v]) => !v)
    .map(([k]) => k);

  if (missingSource.length > 0) {
    console.error(`❌ Missing SOURCE_DB env variables: ${missingSource.join(", ")}`);
    console.error("\nRequired environment variables:");
    console.error("  SOURCE_DB_HOST, SOURCE_DB_PORT, SOURCE_DB_USER, SOURCE_DB_PASSWORD, SOURCE_DB_NAME");
    console.error("  TARGET_DB_HOST, TARGET_DB_PORT, TARGET_DB_USER, TARGET_DB_PASSWORD, TARGET_DB_NAME");
    process.exit(1);
  }

  if (missingTarget.length > 0) {
    console.error(`❌ Missing TARGET_DB env variables: ${missingTarget.join(", ")}`);
    process.exit(1);
  }

  // Create connections
  console.log("📡 Connecting to databases...");
  const sourceDb = createConnection(SOURCE_DB, "source");
  const targetDb = createConnection(TARGET_DB, "target");

  try {
    // Test connections
    await sourceDb.authenticate();
    console.log(`   ✅ Source DB connected: ${SOURCE_DB.host}/${SOURCE_DB.database}`);

    await targetDb.authenticate();
    console.log(`   ✅ Target DB connected: ${TARGET_DB.host}/${TARGET_DB.database}`);

    // Get all tables from source
    const tables = await getAllTables(sourceDb);
    const tablesToMigrate = tables.filter((t) => !TABLES_TO_SKIP.includes(t));

    console.log(`\n📋 Found ${tables.length} tables, migrating ${tablesToMigrate.length}`);
    if (TABLES_TO_SKIP.length > 0) {
      console.log(`   Skipping: ${TABLES_TO_SKIP.join(", ")}`);
    }

    // Try to disable all constraints using session_replication_role
    let useReplicationRole = false;
    console.log("\n🔧 Setting up constraint bypass...");
    try {
      await disableAllConstraints(targetDb);
      useReplicationRole = true;
    } catch (error) {
      console.log("   Will migrate with FK constraints active (may fail on child tables)");
    }

    // Migration results
    const results: {
      table: string;
      success: boolean;
      rowsMigrated: number;
      error?: string;
      skippedColumns?: string[];
    }[] = [];

    // Migrate each table
    for (const tableName of tablesToMigrate) {
      const result = await migrateTable(sourceDb, targetDb, tableName, useReplicationRole);
      results.push({ table: tableName, ...result });
    }

    // Re-enable constraints if we disabled them
    if (useReplicationRole) {
      console.log("\n🔧 Re-enabling constraints...");
      await enableAllConstraints(targetDb);
    }

    // Print summary
    console.log("\n\n" + "=".repeat(50));
    console.log("📊 MIGRATION SUMMARY");
    console.log("=".repeat(50));

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const totalMigrated = results.reduce((sum, r) => sum + r.rowsMigrated, 0);

    console.log(`\n   Total tables: ${results.length}`);
    console.log(`   ✅ Successful: ${successful.length}`);
    console.log(`   ❌ Failed: ${failed.length}`);
    console.log(`   📦 Total rows migrated: ${totalMigrated}`);

    if (failed.length > 0) {
      console.log("\n   Failed tables:");
      failed.forEach((f) => {
        console.log(`      - ${f.table}: ${f.error}`);
      });
    }

    console.log("\n✨ Migration completed!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await sourceDb.close();
    await targetDb.close();
  }
}

// Run migration
main();

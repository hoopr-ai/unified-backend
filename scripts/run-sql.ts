/**
 * Run one .sql file against the unified DB named in the loaded env file.
 *
 * Generalises run-create-studio-tables.ts, which hardcoded its filename. The
 * migrations in this directory carry their own BEGIN/COMMIT, so this runner
 * does not wrap them — it just prints the target loudly before connecting,
 * because the single most important fact about a migration run is which
 * database it is about to touch.
 *
 * Usage:
 *   npx tsx scripts/run-sql.ts scripts/migration-add-mixer-platform.sql
 *   npx tsx --env-file=.env.sage scripts/run-sql.ts scripts/migration-add-mixer-platform.sql
 *
 * .env points at PRODUCTION. Pass --env-file for anything else.
 */
import "dotenv/config";
import { Client } from "pg";
import { readFileSync } from "fs";
import { resolve } from "path";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: npx tsx scripts/run-sql.ts <file.sql>");
  process.exit(1);
}

const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`❌ Missing env: ${k}`);
    process.exit(1);
  }
}

const sqlPath = resolve(file);
const sql = readFileSync(sqlPath, "utf-8");

console.log(`file   : ${sqlPath}`);
console.log(`target : ${process.env.DB_NAME} @ ${process.env.DB_HOST}\n`);

const client = new Client({
  host: process.env.DB_HOST as string,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log("✅ applied");
} catch (err) {
  console.error(`❌ failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}

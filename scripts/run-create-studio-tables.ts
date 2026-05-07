/**
 * Runs create-studio-tables.sql against the unified DB using env from unified-backend/.env.
 * Usage:  cd unified-backend && npx tsx scripts/run-create-studio-tables.ts
 * Idempotent — safe to run multiple times (CREATE TABLE IF NOT EXISTS).
 */
import "dotenv/config";
import { Client } from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "create-studio-tables.sql");

const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`❌ Missing env: ${k}`);
    process.exit(1);
  }
}

const client = new Client({
  host: process.env.DB_HOST as string,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,
  ssl: { rejectUnauthorized: false },
});

const sql = readFileSync(sqlPath, "utf-8");

await client.connect();
console.log(`✅ Connected to ${process.env.DB_NAME} on ${process.env.DB_HOST}`);

try {
  await client.query(sql);
  console.log("✅ Tables created (or already existed). Safe to re-run.");
} catch (err) {
  console.error("❌ Failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}

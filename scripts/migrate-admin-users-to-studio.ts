/**
 * Migrates AdminUser rows from hooprsmash DB into unified DB:
 *   hooprsmash."AdminUser"  ->  unified.users (platform=STUDIO) + unified.user_roles
 *
 * Required env (in unified-backend/.env):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME           (target = unified)
 *   HOOPR_SMASH_DB_HOST, HOOPR_SMASH_DB_PORT,
 *   HOOPR_SMASH_DB_USER, HOOPR_SMASH_DB_PASSWORD,
 *   HOOPR_SMASH_DB_NAME                                        (source = hooprsmash)
 *
 * Run:  npx ts-node scripts/migrate-admin-users-to-studio.ts
 *
 * Idempotent: users that already exist with (email, platform=STUDIO) are skipped.
 * Password is carried over as-is (already bcrypt hashed). No re-hash.
 * restrictions JSONB is transformed from { owner_code } -> { ownerCode } (camelCase).
 */
import "dotenv/config";
import { Client } from "pg";

const STUDIO_PLATFORM = "STUDIO";

const requireEnv = (key: string): string => {
  const v = process.env[key];
  if (!v) {
    console.error(`❌ Missing env: ${key}`);
    process.exit(1);
  }
  return v;
};

const SOURCE_DB = {
  host: requireEnv("HOOPR_SMASH_DB_HOST"),
  port: parseInt(requireEnv("HOOPR_SMASH_DB_PORT"), 10),
  user: requireEnv("HOOPR_SMASH_DB_USER"),
  password: requireEnv("HOOPR_SMASH_DB_PASSWORD"),
  database: requireEnv("HOOPR_SMASH_DB_NAME"),
  ssl: { rejectUnauthorized: false },
};

const TARGET_DB = {
  host: requireEnv("DB_HOST"),
  port: parseInt(requireEnv("DB_PORT"), 10),
  user: requireEnv("DB_USER"),
  password: requireEnv("DB_PASSWORD"),
  database: requireEnv("DB_NAME"),
  ssl: { rejectUnauthorized: false },
};

type OldRestrictionEntry = { category?: string; owner_code?: string };
type NewRestrictionEntry = { category?: string; ownerCode?: string };

const toCamelRestrictions = (
  raw: unknown
): NewRestrictionEntry[] | null => {
  if (!raw) return null;
  const arr = Array.isArray(raw) ? (raw as OldRestrictionEntry[]) : null;
  if (!arr || arr.length === 0) return null;
  return arr.map((r) => {
    const entry: NewRestrictionEntry = {};
    if (r.category) entry.category = r.category;
    if (r.owner_code) entry.ownerCode = r.owner_code;
    return entry;
  });
};

const mapRole = (sourceRole: unknown): string => {
  const r = String(sourceRole ?? "").trim().toLowerCase();
  if (r === "admin") return "ADMIN";
  if (r === "user") return "USER";
  if (r === "master") return "MASTER";
  // fall-back: uppercase whatever is there; log so we can review
  const fallback = r.toUpperCase() || "USER";
  console.warn(`⚠️  Unknown source role "${sourceRole}", defaulting to ${fallback}`);
  return fallback;
};

interface AdminUserRow {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  password: string;
  restrictions: unknown;
  role: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

async function run() {
  const source = new Client(SOURCE_DB);
  const target = new Client(TARGET_DB);

  await source.connect();
  console.log("✅ Connected to hooprsmash (source)");
  await target.connect();
  console.log("✅ Connected to unified (target)");

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const sourceRows = await source.query<AdminUserRow>(
      `SELECT id, "firstName", "lastName", email, password,
              restrictions, role, created_at, updated_at
       FROM "AdminUser"
       ORDER BY id ASC`
    );
    console.log(`📋 Found ${sourceRows.rowCount} AdminUser rows`);

    for (const row of sourceRows.rows) {
      const email = (row.email || "").toLowerCase().trim();
      if (!email) {
        console.warn(`⚠️  Skipping AdminUser id=${row.id} — empty email`);
        skipped++;
        continue;
      }

      // Skip if already migrated
      const existing = await target.query(
        `SELECT id FROM users WHERE email = $1 AND platform = $2 LIMIT 1`,
        [email, STUDIO_PLATFORM]
      );
      if ((existing.rowCount ?? 0) > 0) {
        console.log(`⏭️  ${email} already exists, skipping`);
        skipped++;
        continue;
      }

      const createdAt = row.created_at ?? new Date();
      const updatedAt = row.updated_at ?? createdAt;

      try {
        await target.query("BEGIN");

        const userInsert = await target.query<{ id: number }>(
          `INSERT INTO users
             (email, platform, password, "firstName", "lastName", status,
              "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            email,
            STUDIO_PLATFORM,
            row.password,
            row.firstName,
            row.lastName,
            "ACTIVE",
            createdAt,
            updatedAt,
          ]
        );

        const newUserId = userInsert.rows[0].id;

        const role = mapRole(row.role);
        const restrictions = toCamelRestrictions(row.restrictions);

        await target.query(
          `INSERT INTO user_roles
             ("userId", role, status, restrictions, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
          [
            newUserId,
            role,
            "ACTIVE",
            restrictions ? JSON.stringify(restrictions) : null,
            createdAt,
            updatedAt,
          ]
        );

        await target.query("COMMIT");
        console.log(
          `✅ Migrated ${email} (source id=${row.id} -> target users.id=${newUserId}, role=${role})`
        );
        migrated++;
      } catch (err) {
        await target.query("ROLLBACK");
        console.error(`❌ Failed to migrate ${email}:`, (err as Error).message);
        failed++;
      }
    }
  } finally {
    await source.end();
    await target.end();
  }

  console.log("\n────── Summary ──────");
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped (already exists / blank email): ${skipped}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("❌ Migration crashed:", err);
  process.exit(1);
});

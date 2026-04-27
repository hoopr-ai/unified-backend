/* eslint-disable no-console */
/**
 * Migrate specific users and their related data from PROD → DEV (staging).
 *
 * Usage:
 *   1. Copy .env.migration.example → .env.migration and fill in both DB creds.
 *   2. Dry-run (default, no writes):
 *        npx tsx scripts/migrate-user-prod-to-dev.ts
 *   3. Apply writes to DEV:
 *        npx tsx scripts/migrate-user-prod-to-dev.ts --apply
 *
 * Rules (per user instructions):
 *   - Brand & organization: copy row with same id; if id already exists in DEV, skip insert and reuse.
 *   - User: if (email, platform) already exists in DEV → SKIP that user entirely.
 *     Otherwise insert the prod user row (new DEV id via auto-increment) and copy all children.
 *   - Child FK violations (e.g. a liked track missing in dev) → logged and skipped.
 *
 * PROD connection is used read-only. All DEV writes happen inside a single transaction
 * per user, so a mid-user failure rolls that user back cleanly.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TARGET_EMAILS = [
  "neel.shah@interactiveavenues.com",
  "nitinpal@merakiconnect.com",
];

// Child tables to copy, in safe FK order. userColumn is the FK back to users.id.
// Order matters: licenses before video_links (video_links.licenseId → licenses.id).
const CHILD_TABLES: { table: string; userColumn: string }[] = [
  { table: "user_roles", userColumn: "userId" },
  { table: "user_entity_details", userColumn: "userId" },
  { table: "user_addresses", userColumn: "userId" },
  { table: "bank_details", userColumn: "userId" },
  { table: "user_redemptions", userColumn: "userId" },
  { table: "user_liked_tracks", userColumn: "userId" },
  { table: "user_stream_history", userColumn: "userId" },
  { table: "sound_projects", userColumn: "userId" },
  { table: "licenses", userColumn: "userId" },
  { table: "video_links", userColumn: "userId" },
];

const APPLY = process.argv.includes("--apply");

type Row = Record<string, unknown>;

function loadMigrationEnv() {
  const path = resolve(__dirname, "..", ".env.migration");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `Missing ${path}. Copy .env.migration.example and fill in credentials.`,
    );
  }
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
    env[key] = val;
  }
  const require_ = (k: string) => {
    if (!env[k]) throw new Error(`${k} missing in .env.migration`);
    return env[k];
  };
  return {
    prod: {
      host: require_("PROD_DB_HOST"),
      user: require_("PROD_DB_USER"),
      password: require_("PROD_DB_PASSWORD"),
      database: require_("PROD_DB_NAME"),
      port: Number(require_("PROD_DB_PORT")),
      ssl: env.PROD_DB_SSL !== "false" ? { rejectUnauthorized: false } : false,
    },
    dev: {
      host: require_("DEV_DB_HOST"),
      user: require_("DEV_DB_USER"),
      password: require_("DEV_DB_PASSWORD"),
      database: require_("DEV_DB_NAME"),
      port: Number(require_("DEV_DB_PORT")),
      ssl: env.DEV_DB_SSL !== "false" ? { rejectUnauthorized: false } : false,
    },
  };
}

async function quoteIdent(c: Client, name: string) {
  const r = await c.query("select quote_ident($1) as q", [name]);
  return r.rows[0].q as string;
}

async function getTableColumns(c: Client, table: string): Promise<string[]> {
  const r = await c.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1
     order by ordinal_position`,
    [table],
  );
  return r.rows.map((x: { column_name: string }) => x.column_name);
}

async function idExists(
  c: Client,
  table: string,
  id: number | string,
): Promise<boolean> {
  const q = await quoteIdent(c, table);
  const r = await c.query(`select 1 from ${q} where id = $1 limit 1`, [id]);
  return r.rowCount! > 0;
}

/** Insert prod row into dev with the SAME id. If id already exists in dev, skip. */
async function copyRowPreserveId(
  dev: Client,
  table: string,
  row: Row,
  dryRun: boolean,
): Promise<"inserted" | "already-exists" | "skipped-dry"> {
  if (await idExists(dev, table, row.id as number)) return "already-exists";
  if (dryRun) return "skipped-dry";

  const cols = await getTableColumns(dev, table);
  const entries = cols.filter((c) => c in row).map((c) => [c, row[c]] as const);
  const colList = entries.map((e) => `"${e[0]}"`).join(", ");
  const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
  const values = entries.map((e) => e[1]);
  const quotedTable = await quoteIdent(dev, table);

  await dev.query(
    `insert into ${quotedTable} (${colList}) values (${placeholders})
     on conflict (id) do nothing`,
    values,
  );
  // Bump the sequence so future auto-incs don't collide with preserved ids.
  await dev.query(
    `select setval(pg_get_serial_sequence($1, 'id'),
                   greatest((select coalesce(max(id), 1) from ${quotedTable}), 1))`,
    [table],
  );
  return "inserted";
}

async function fetchUserRowsByEmail(prod: Client, email: string): Promise<Row[]> {
  const r = await prod.query(`select * from users where lower(email) = lower($1)`, [
    email,
  ]);
  return r.rows;
}

async function devUserExists(
  dev: Client,
  email: string,
  platform: string,
): Promise<boolean> {
  const r = await dev.query(
    `select 1 from users where lower(email) = lower($1) and platform = $2 limit 1`,
    [email, platform],
  );
  return r.rowCount! > 0;
}

/** Insert user row on dev, let dev assign a new id, return it. */
async function insertUserReturningId(
  dev: Client,
  prodUser: Row,
  dryRun: boolean,
): Promise<number> {
  const cols = await getTableColumns(dev, "users");
  const exclude = new Set(["id", "createdAt", "updatedAt"]);
  const entries = cols
    .filter((c) => !exclude.has(c) && c in prodUser)
    .map((c) => [c, prodUser[c]] as const);
  const colList = entries.map((e) => `"${e[0]}"`).join(", ");
  const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
  const values = entries.map((e) => e[1]);

  if (dryRun) {
    console.log(`      [dry] would INSERT users (${colList}) RETURNING id`);
    return -1;
  }
  const r = await dev.query(
    `insert into users (${colList}) values (${placeholders}) returning id`,
    values,
  );
  return r.rows[0].id as number;
}

async function copyChildRows(
  prod: Client,
  dev: Client,
  table: string,
  userColumn: string,
  prodUserId: number,
  devUserId: number,
  dryRun: boolean,
): Promise<{ total: number; inserted: number; fkErrors: number; skipped: number }> {
  const quotedCol = `"${userColumn}"`;
  const q = await quoteIdent(prod, table);
  const rows = (await prod.query(`select * from ${q} where ${quotedCol} = $1`, [
    prodUserId,
  ])).rows as Row[];

  const result = { total: rows.length, inserted: 0, fkErrors: 0, skipped: 0 };
  if (rows.length === 0) return result;

  const devCols = await getTableColumns(dev, table);
  const exclude = new Set(["id", "createdAt", "updatedAt"]);
  const copyCols = devCols.filter((c) => !exclude.has(c));

  for (const row of rows) {
    // Remap userId FK to dev id.
    const remapped: Row = { ...row, [userColumn]: devUserId };
    const entries = copyCols.filter((c) => c in remapped).map(
      (c) => [c, remapped[c]] as const,
    );
    const colList = entries.map((e) => `"${e[0]}"`).join(", ");
    const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
    const values = entries.map((e) => e[1]);
    const quotedTable = await quoteIdent(dev, table);

    if (dryRun) {
      result.inserted += 1;
      continue;
    }

    try {
      // Savepoint so a single bad row doesn't kill the whole user transaction.
      await dev.query("savepoint child_row");
      await dev.query(
        `insert into ${quotedTable} (${colList}) values (${placeholders})
         on conflict do nothing`,
        values,
      );
      await dev.query("release savepoint child_row");
      result.inserted += 1;
    } catch (e) {
      await dev.query("rollback to savepoint child_row");
      await dev.query("release savepoint child_row");
      const msg = (e as Error).message;
      if (/foreign key|violates foreign key/i.test(msg)) {
        result.fkErrors += 1;
      } else {
        result.skipped += 1;
      }
      console.warn(`        [!] ${table}: skipped row – ${msg}`);
    }
  }
  return result;
}

async function ensureBrandChainCopied(
  prod: Client,
  dev: Client,
  brandId: number,
  dryRun: boolean,
): Promise<void> {
  const brandRows = (await prod.query(`select * from brands where id = $1`, [
    brandId,
  ])).rows;
  if (brandRows.length === 0) {
    console.warn(`    [!] prod brand ${brandId} not found; user will point to missing brand`);
    return;
  }
  const brand = brandRows[0] as Row;
  const orgId = brand.organizationId as number | null | undefined;

  if (orgId != null) {
    const orgRows = (await prod.query(`select * from organizations where id = $1`, [
      orgId,
    ])).rows;
    if (orgRows.length > 0) {
      const org = orgRows[0] as Row;
      const status = await copyRowPreserveId(dev, "organizations", org, dryRun);
      console.log(`    organization ${orgId}: ${status}`);
    } else {
      console.warn(`    [!] prod organization ${orgId} not found`);
    }
  }

  const bStatus = await copyRowPreserveId(dev, "brands", brand, dryRun);
  console.log(`    brand ${brandId}: ${bStatus}`);
}

async function tableExists(c: Client, table: string): Promise<boolean> {
  const r = await c.query(
    `select 1 from information_schema.tables
     where table_schema = 'public' and table_name = $1 limit 1`,
    [table],
  );
  return r.rowCount! > 0;
}

async function main() {
  const cfg = loadMigrationEnv();
  const prod = new Client(cfg.prod);
  const dev = new Client(cfg.dev);

  await prod.connect();
  await dev.connect();

  // Safety: enforce read-only on prod for this session.
  await prod.query("set default_transaction_read_only = on");

  // Skip child tables that don't exist on dev (or prod) — schema drift tolerant.
  const activeChildTables: typeof CHILD_TABLES = [];
  for (const t of CHILD_TABLES) {
    const onProd = await tableExists(prod, t.table);
    const onDev = await tableExists(dev, t.table);
    if (onProd && onDev) {
      activeChildTables.push(t);
    } else {
      console.warn(
        `[skip-table] ${t.table}: prod=${onProd ? "yes" : "MISSING"} dev=${onDev ? "yes" : "MISSING"}`,
      );
    }
  }

  console.log(
    `\n${APPLY ? "APPLY MODE — writes will happen on DEV" : "DRY RUN — no writes"}\n`,
  );

  const report: string[] = [];

  for (const email of TARGET_EMAILS) {
    console.log(`\n=== ${email} ===`);
    const prodRows = await fetchUserRowsByEmail(prod, email);
    if (prodRows.length === 0) {
      console.log("  not found on prod — skipped");
      report.push(`${email}: NOT FOUND on prod`);
      continue;
    }
    console.log(`  prod rows: ${prodRows.length} (one per platform)`);

    for (const prodUser of prodRows) {
      const platform = prodUser.platform as string;
      const prodUserId = prodUser.id as number;
      console.log(`  platform=${platform} prod.id=${prodUserId}`);

      if (await devUserExists(dev, email, platform)) {
        console.log("    exists on dev — SKIPPING (per rule)");
        report.push(`${email} [${platform}]: skipped (already on dev)`);
        continue;
      }

      await dev.query("begin");
      try {
        if (prodUser.brandId != null) {
          await ensureBrandChainCopied(prod, dev, prodUser.brandId as number, !APPLY);
        }

        const devUserId = await insertUserReturningId(dev, prodUser, !APPLY);
        console.log(`    created on dev with id=${APPLY ? devUserId : "(dry)"}`);

        const childSummary: string[] = [];
        for (const { table, userColumn } of activeChildTables) {
          try {
            await dev.query("savepoint table_copy");
            const r = await copyChildRows(
              prod,
              dev,
              table,
              userColumn,
              prodUserId,
              APPLY ? devUserId : 0,
              !APPLY,
            );
            await dev.query("release savepoint table_copy");
            childSummary.push(
              `${table}:${r.inserted}/${r.total}${r.fkErrors ? ` fk=${r.fkErrors}` : ""}${r.skipped ? ` skip=${r.skipped}` : ""}`,
            );
            console.log(
              `    ${table.padEnd(22)} total=${r.total} inserted=${r.inserted} fkErr=${r.fkErrors} skipped=${r.skipped}`,
            );
          } catch (err) {
            await dev.query("rollback to savepoint table_copy");
            await dev.query("release savepoint table_copy");
            const msg = (err as Error).message;
            console.warn(`    ${table.padEnd(22)} ERROR — skipping (${msg})`);
            childSummary.push(`${table}:ERR`);
          }
        }

        if (APPLY) {
          await dev.query("commit");
        } else {
          await dev.query("rollback");
        }
        report.push(
          `${email} [${platform}]: ${APPLY ? "MIGRATED" : "dry-ok"} — ${childSummary.join(", ")}`,
        );
      } catch (e) {
        await dev.query("rollback");
        const msg = (e as Error).message;
        console.error(`    !! transaction rolled back: ${msg}`);
        report.push(`${email} [${platform}]: FAILED — ${msg}`);
      }
    }
  }

  await prod.end();
  await dev.end();

  console.log("\n\n===== SUMMARY =====");
  for (const line of report) console.log("  " + line);
  console.log(
    `\n${APPLY ? "Done (writes committed)." : "Dry run complete. Re-run with --apply to write."}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

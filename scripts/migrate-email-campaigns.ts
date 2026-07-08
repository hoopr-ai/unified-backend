/* eslint-disable no-console */
// One-off import of the legacy hoopr-backend email campaign history into
// unified-backend's email_campaigns / email_campaign_recipients tables.
//
// Reads the hoopr Postgres via HOOPR_DB_* env vars and writes through the
// unified Sequelize models (DB_* env vars). Idempotent: rows are inserted
// with their original UUIDs and ignoreDuplicates, so re-running is safe.
//
// Usage:
//   HOOPR_DB_HOST=... HOOPR_DB_PORT=5432 HOOPR_DB_USER=... \
//   HOOPR_DB_PASSWORD=... HOOPR_DB_NAME=... npx tsx scripts/migrate-email-campaigns.ts
//
// Notes:
//  - hoopr status 'seeding' maps to 'draft' (the new system has no seeding phase)
//  - hoopr's per-user seed cursor columns (seededCount, lastSeededUserId) are
//    dropped; userId is preserved as sourceUserId
//  - soft-deleted hoopr campaigns (deleted IS NOT NULL) are skipped

import "dotenv/config";
import pg from "pg";
import { sequelize } from "../services/persistence-service/database";
import {
  EmailCampaignModel,
  EmailCampaignRecipientModel,
} from "../services/persistence-service/email-campaign/schemas/modules.export";
import {
  EmailCampaignStatus,
  EmailRecipientStatus,
} from "../services/dto-service/email-campaign/email-campaign.enum";

const CHUNK = 5000;

const requiredEnv = [
  "HOOPR_DB_HOST",
  "HOOPR_DB_PORT",
  "HOOPR_DB_USER",
  "HOOPR_DB_PASSWORD",
  "HOOPR_DB_NAME",
];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const hoopr = new pg.Client({
  host: process.env.HOOPR_DB_HOST,
  port: Number(process.env.HOOPR_DB_PORT),
  user: process.env.HOOPR_DB_USER,
  password: process.env.HOOPR_DB_PASSWORD,
  database: process.env.HOOPR_DB_NAME,
  ssl:
    process.env.HOOPR_DB_SSL === "false"
      ? undefined
      : { rejectUnauthorized: false },
});

const mapStatus = (status: string): EmailCampaignStatus =>
  status === "seeding"
    ? EmailCampaignStatus.DRAFT
    : (status as EmailCampaignStatus);

async function migrateCampaigns(): Promise<number> {
  const { rows } = await hoopr.query(
    `SELECT id, name, subject, html, status, "totalRecipients", "dailyQuota",
            "ratePerSec", "batchSize", "maxAttempts", "startedAt", "completedAt",
            "createdAt", "updatedAt"
     FROM "emailCampaigns"
     WHERE deleted IS NULL
     ORDER BY "createdAt" ASC`
  );

  if (rows.length) {
    await EmailCampaignModel.bulkCreate(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        subject: r.subject,
        html: r.html,
        status: mapStatus(r.status),
        totalRecipients: r.totalRecipients ?? 0,
        dailyQuota: r.dailyQuota ?? 45000,
        ratePerSec: r.ratePerSec ?? 10,
        batchSize: r.batchSize ?? 500,
        maxAttempts: r.maxAttempts ?? 2,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      { ignoreDuplicates: true }
    );
  }
  return rows.length;
}

async function migrateRecipients(): Promise<number> {
  let lastId = "";
  let migrated = 0;

  for (;;) {
    const { rows } = await hoopr.query(
      `SELECT id, "campaignId", "userId", email, name, status, attempts,
              "messageId", error, "sentAt", "createdAt", "updatedAt"
       FROM "emailCampaignLogs"
       ${lastId ? "WHERE id > $1" : ""}
       ORDER BY id ASC
       LIMIT ${CHUNK}`,
      lastId ? [lastId] : []
    );
    if (!rows.length) break;

    await EmailCampaignRecipientModel.bulkCreate(
      rows.map((r) => ({
        id: r.id,
        campaignId: r.campaignId,
        sourceUserId: r.userId,
        email: String(r.email || "").toLowerCase(),
        name: r.name,
        status: r.status as EmailRecipientStatus,
        attempts: r.attempts ?? 0,
        messageId: r.messageId,
        error: r.error,
        sentAt: r.sentAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      { ignoreDuplicates: true }
    );

    migrated += rows.length;
    lastId = rows[rows.length - 1].id;
    console.log(`  … ${migrated} recipient rows processed`);
  }
  return migrated;
}

async function main() {
  console.log("Connecting…");
  await hoopr.connect();
  await sequelize.authenticate();
  // Create the target tables if this env hasn't booted the app with DB_SYNC yet
  await EmailCampaignModel.sync();
  await EmailCampaignRecipientModel.sync();

  console.log("Migrating campaigns…");
  const campaigns = await migrateCampaigns();
  console.log(`✅ ${campaigns} campaigns processed`);

  console.log("Migrating recipients/logs…");
  const recipients = await migrateRecipients();
  console.log(`✅ ${recipients} recipient rows processed`);

  await hoopr.end();
  await sequelize.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});

import * as XLSX from "xlsx";
import { AppError } from "../../helper-service/AppError";
import { logger } from "../../helper-service/logger";
import { sendSesEmail } from "../../helper-service/ses.client";
import {
  createCampaign,
  findCampaignById,
  listCampaigns,
  updateCampaign,
  softDeleteCampaign,
  claimCampaignLock,
  releaseCampaignLock,
  findOldestRunningCampaign,
  bulkInsertRecipients,
  countRecipients,
  deletePendingRecipients,
  getRecipientStatusCounts,
  listRecipients,
  findSendBatch,
  countSentInLast24h,
  findSuppressedAmong,
  isEmailSuppressed,
  countEventsByType,
  findTemplateById,
  type EmailCampaignRecipientDetails,
} from "../../persistence-service/email-campaign/modules.export";
import {
  EmailCampaignStatus,
  EmailRecipientStatus,
  type CreateEmailCampaignRequestData,
  type UpdateEmailCampaignRequestData,
  type ListEmailCampaignsQueryData,
  type ListRecipientsQueryData,
  type CsvUploadSummary,
  type EmailCampaignStats,
  type ProcessBatchResult,
} from "../../dto-service/email-campaign/modules.export";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EDITABLE_STATUSES = [
  EmailCampaignStatus.DRAFT,
  EmailCampaignStatus.READY,
  EmailCampaignStatus.PAUSED,
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Personalisation tokens; name accepts several natural spellings:
// {{name}}, {{user name}}, {{username}}, {{user_name}} (any case) and {{email}}.
export const personalize = (
  template: string,
  recipient: { name?: string | null; email?: string | null }
): string =>
  template
    .replace(/{{\s*(?:user[\s_]?name|name)\s*}}/gi, recipient.name || "there")
    .replace(/{{\s*email\s*}}/gi, recipient.email || "");

// ─── Campaign CRUD ───────────────────────────────────────────────────────────

export const createCampaignService = async (
  payload: CreateEmailCampaignRequestData,
  createdBy?: number
) => {
  let html = payload.html;
  let subject = payload.subject;

  if (payload.templateId) {
    const template = await findTemplateById(payload.templateId);
    if (!template) throw new AppError("Template not found", 404);
    if (!html) html = template.html;
    if (!subject && template.subject) subject = template.subject;
  }
  if (!html) throw new AppError("Provide html or a templateId", 400);

  return createCampaign({
    name: payload.name,
    subject,
    html,
    templateId: payload.templateId ?? null,
    status: EmailCampaignStatus.DRAFT,
    ...(payload.dailyQuota ? { dailyQuota: payload.dailyQuota } : {}),
    ...(payload.ratePerSec ? { ratePerSec: payload.ratePerSec } : {}),
    ...(payload.batchSize ? { batchSize: payload.batchSize } : {}),
    ...(payload.maxAttempts ? { maxAttempts: payload.maxAttempts } : {}),
    createdBy: createdBy ?? null,
  });
};

export const listCampaignsService = async (query: ListEmailCampaignsQueryData) => {
  const page = query.page || 1;
  const limit = query.limit || 20;
  const { rows, count } = await listCampaigns({
    page,
    limit,
    search: query.search,
    status: query.status,
  });
  return { campaigns: rows, total: count, page, limit };
};

export const getCampaignService = async (id: string) => {
  const campaign = await findCampaignById(id);
  if (!campaign) throw new AppError("Campaign not found", 404);
  const counts = await getRecipientStatusCounts(id);
  return { campaign, counts };
};

export const updateCampaignService = async (
  id: string,
  updates: UpdateEmailCampaignRequestData
) => {
  const campaign = await findCampaignById(id);
  if (!campaign) throw new AppError("Campaign not found", 404);
  if (!EDITABLE_STATUSES.includes(campaign.status)) {
    throw new AppError(
      `Cannot edit a campaign in status '${campaign.status}'`,
      409
    );
  }
  await campaign.update(updates);
  return campaign;
};

export const deleteCampaignService = async (id: string) => {
  const campaign = await findCampaignById(id);
  if (!campaign) throw new AppError("Campaign not found", 404);
  if (campaign.status === EmailCampaignStatus.RUNNING) {
    throw new AppError("Pause the campaign before deleting it", 409);
  }
  await softDeleteCampaign(id);
};

// ─── Recipients: CSV / XLSX ingest ───────────────────────────────────────────

interface ParsedRecipient {
  email: string;
  name: string | null;
}

// Accepts CSV or XLSX. The first sheet must have an "email" column (any
// casing); "name" is optional. Everything else is ignored.
const parseRecipientFile = (buffer: Buffer): { recipients: ParsedRecipient[]; invalid: number; parsed: number } => {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    throw new AppError("Could not parse the file — upload a CSV or XLSX", 400);
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new AppError("The uploaded file is empty", 400);

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: "" }
  );
  if (!rows.length) throw new AppError("No data rows found in the file", 400);

  const keys = Object.keys(rows[0]);
  const emailKey = keys.find((k) => /^(e-?mail|email[ _]?address)$/i.test(k.trim()));
  if (!emailKey) {
    throw new AppError('The file must have an "email" column header', 400);
  }
  const nameKey = keys.find((k) => /^(name|full[ _]?name|first[ _]?name)$/i.test(k.trim()));

  const recipients: ParsedRecipient[] = [];
  let invalid = 0;
  for (const row of rows) {
    const email = String(row[emailKey] ?? "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      invalid += 1;
      continue;
    }
    const name = nameKey ? String(row[nameKey] ?? "").trim() || null : null;
    recipients.push({ email, name });
  }
  return { recipients, invalid, parsed: rows.length };
};

export const uploadRecipientsService = async (
  campaignId: string,
  fileBuffer: Buffer
): Promise<CsvUploadSummary> => {
  const campaign = await findCampaignById(campaignId);
  if (!campaign) throw new AppError("Campaign not found", 404);
  if (!EDITABLE_STATUSES.includes(campaign.status)) {
    throw new AppError(
      `Cannot add recipients while the campaign is '${campaign.status}'`,
      409
    );
  }

  const { recipients, invalid, parsed } = parseRecipientFile(fileBuffer);

  // In-file dedupe (last occurrence wins so a later row can fill in a name)
  const byEmail = new Map<string, ParsedRecipient>();
  recipients.forEach((r) => byEmail.set(r.email, r));
  const uniqueRecipients = [...byEmail.values()];
  const duplicateRows = recipients.length - uniqueRecipients.length;

  // Drop suppressed addresses (hard bounces / complaints / manual blocks)
  const suppressed = await findSuppressedAmong(uniqueRecipients.map((r) => r.email));
  const sendable = uniqueRecipients.filter((r) => !suppressed.has(r.email));

  const before = await countRecipients(campaignId);
  if (sendable.length) {
    const rows: EmailCampaignRecipientDetails[] = sendable.map((r) => ({
      campaignId,
      email: r.email,
      name: r.name,
      status: EmailRecipientStatus.PENDING,
    }));
    // ignoreDuplicates + unique(campaignId,email) makes re-uploads idempotent
    const CHUNK = 5000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await bulkInsertRecipients(rows.slice(i, i + CHUNK));
    }
  }
  const total = await countRecipients(campaignId);

  await campaign.update({
    totalRecipients: total,
    ...(campaign.status === EmailCampaignStatus.DRAFT && total > 0
      ? { status: EmailCampaignStatus.READY }
      : {}),
  });

  return {
    parsedRows: parsed,
    validRows: recipients.length,
    invalidRows: invalid,
    duplicateRows,
    suppressedRows: suppressed.size,
    added: total - before,
    totalRecipients: total,
  };
};

export const clearPendingRecipientsService = async (campaignId: string) => {
  const campaign = await findCampaignById(campaignId);
  if (!campaign) throw new AppError("Campaign not found", 404);
  if (campaign.status === EmailCampaignStatus.RUNNING) {
    throw new AppError("Pause the campaign before clearing recipients", 409);
  }
  const removed = await deletePendingRecipients(campaignId);
  const total = await countRecipients(campaignId);
  await campaign.update({
    totalRecipients: total,
    ...(total === 0 && campaign.status === EmailCampaignStatus.READY
      ? { status: EmailCampaignStatus.DRAFT }
      : {}),
  });
  return { removed, totalRecipients: total };
};

export const listRecipientsService = async (
  campaignId: string,
  query: ListRecipientsQueryData
) => {
  const campaign = await findCampaignById(campaignId);
  if (!campaign) throw new AppError("Campaign not found", 404);
  const page = query.page || 1;
  const limit = query.limit || 50;
  const { rows, count } = await listRecipients(campaignId, {
    page,
    limit,
    status: query.status,
    search: query.search,
  });
  return { recipients: rows, total: count, page, limit };
};

// ─── Test send ───────────────────────────────────────────────────────────────

// Sends the campaign content immediately to a handful of addresses via the
// exact same SES path as the real blast. Does NOT touch the recipient ledger
// or the daily-quota accounting (a few test emails are negligible).
export const sendTestEmailService = async (campaignId: string, emails: string[]) => {
  const campaign = await findCampaignById(campaignId);
  if (!campaign) throw new AppError("Campaign not found", 404);

  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    try {
      await sendSesEmail({
        to: email,
        subject: `[TEST] ${campaign.subject}`,
        html: personalize(campaign.html, { name: null, email }),
      });
      results.push({ email, ok: true });
    } catch (err) {
      results.push({
        email,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await sleep(150); // stay well under the SES per-second rate
  }
  return { results };
};

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export const startCampaignService = async (id: string) => {
  const campaign = await findCampaignById(id);
  if (!campaign) throw new AppError("Campaign not found", 404);
  if (
    ![EmailCampaignStatus.READY, EmailCampaignStatus.PAUSED].includes(
      campaign.status
    )
  ) {
    throw new AppError(
      `Cannot start a campaign in status '${campaign.status}'`,
      409
    );
  }
  if (!(await countRecipients(id))) {
    throw new AppError("Upload recipients before starting the campaign", 409);
  }
  await campaign.update({
    status: EmailCampaignStatus.RUNNING,
    ...(campaign.startedAt ? {} : { startedAt: new Date() }),
  });
  return campaign;
};

export const pauseCampaignService = async (id: string) => {
  const campaign = await findCampaignById(id);
  if (!campaign) throw new AppError("Campaign not found", 404);
  if (campaign.status !== EmailCampaignStatus.RUNNING) {
    throw new AppError("Only a running campaign can be paused", 409);
  }
  await campaign.update({ status: EmailCampaignStatus.PAUSED });
  return campaign;
};

// ─── Stats ───────────────────────────────────────────────────────────────────

export const getCampaignStatsService = async (
  id: string
): Promise<EmailCampaignStats> => {
  const campaign = await findCampaignById(id);
  if (!campaign) throw new AppError("Campaign not found", 404);

  const counts = await getRecipientStatusCounts(id);
  const events = await countEventsByType(id);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const done = counts.sent + counts.failed + counts.skipped;
  const last24h = await countSentInLast24h();

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      status: campaign.status,
      dailyQuota: campaign.dailyQuota,
      ratePerSec: campaign.ratePerSec,
      batchSize: campaign.batchSize,
      startedAt: campaign.startedAt ?? null,
      completedAt: campaign.completedAt ?? null,
    },
    totalRecipients: total,
    counts,
    bounces: events.bounce || 0,
    complaints: events.complaint || 0,
    progressPercent: total ? Number(((done / total) * 100).toFixed(2)) : 0,
    sentInLast24h: last24h,
    remainingDailyQuota: Math.max(0, campaign.dailyQuota - last24h),
  };
};

// ─── The send engine ─────────────────────────────────────────────────────────
// Ported from hoopr-backend's processCampaignBatch. Invoked by the BullMQ
// worker every minute (plus immediately on start). Each run:
//   - picks the oldest `running` campaign
//   - takes the atomic lock so overlapping ticks can't double-send
//   - respects the rolling 24h daily quota (shared across campaigns)
//   - sends one-by-one at <= ratePerSec, skipping suppressed addresses
//   - writes the outcome to each recipient row, then exits (fully resumable)

export const processCampaignBatch = async (): Promise<ProcessBatchResult> => {
  const candidate = await findOldestRunningCampaign();
  if (!candidate) return { processed: 0, message: "no running campaign" };

  const claimed = await claimCampaignLock(candidate.id);
  if (!claimed) return { processed: 0, message: "campaign busy (locked)" };

  const campaign = candidate;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let suppressedCount = 0;

  try {
    const already = await countSentInLast24h();
    const remainingQuota = campaign.dailyQuota - already;
    if (remainingQuota <= 0) {
      return {
        processed: 0,
        message: "daily quota reached",
        sentInLast24h: already,
      };
    }

    const limit = Math.min(campaign.batchSize, remainingQuota);
    const batch = await findSendBatch(campaign.id, campaign.maxAttempts, limit);

    if (!batch.length) {
      await campaign.update({
        status: EmailCampaignStatus.COMPLETED,
        completedAt: new Date(),
      });
      logger.info(`[EmailCampaign] Campaign ${campaign.id} completed`);
      return { processed: 0, message: "campaign completed" };
    }

    const intervalMs = Math.ceil(1000 / Math.max(1, campaign.ratePerSec));

    for (let i = 0; i < batch.length; i += 1) {
      const recipient = batch[i];

      if (!recipient.email || !EMAIL_RE.test(recipient.email)) {
        await recipient.update({
          status: EmailRecipientStatus.SKIPPED,
          error: "invalid email address",
        });
        skipped += 1;
        continue;
      }

      // Suppression can grow while a campaign runs (live bounce webhooks), so
      // check at send time — not only at upload time.
      if (await isEmailSuppressed(recipient.email)) {
        await recipient.update({
          status: EmailRecipientStatus.SKIPPED,
          error: "suppressed (bounce/complaint/manual)",
        });
        skipped += 1;
        suppressedCount += 1;
        continue;
      }

      try {
        const html = personalize(campaign.html, {
          name: recipient.name,
          email: recipient.email,
        });
        const result = await sendSesEmail({
          to: recipient.email,
          subject: campaign.subject,
          html,
        });
        await recipient.update({
          status: EmailRecipientStatus.SENT,
          messageId: result.messageId,
          sentAt: new Date(),
          attempts: recipient.attempts + 1,
          error: null,
        });
        sent += 1;
      } catch (err) {
        await recipient.update({
          status: EmailRecipientStatus.FAILED,
          attempts: recipient.attempts + 1,
          error: err instanceof Error ? err.message : String(err),
        });
        failed += 1;
      }

      // throttle to stay under the SES send rate (skip the wait after the last)
      if (i < batch.length - 1) await sleep(intervalMs);
    }

    return {
      processed: batch.length,
      sent,
      failed,
      skipped,
      suppressed: suppressedCount,
      campaignId: campaign.id,
    };
  } finally {
    await releaseCampaignLock(campaign.id);
  }
};

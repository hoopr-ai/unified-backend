import { Op, fn, col } from "sequelize";
import {
  EmailCampaignModel,
  EmailCampaignRecipientModel,
  EmailTemplateModel,
  EmailSuppressionModel,
  EmailEventModel,
  type EmailCampaignDetails,
  type EmailCampaignRecipientDetails,
  type EmailTemplateDetails,
  type EmailSuppressionDetails,
  type EmailEventDetails,
} from "./schemas/modules.export";
import {
  EmailCampaignStatus,
  EmailRecipientStatus,
  type RecipientStatusCounts,
} from "../../dto-service/email-campaign/modules.export";

const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000; // SES enforces a rolling 24h window
const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // a worker run holds the campaign lock this long

// ─── Campaigns ───────────────────────────────────────────────────────────────

export const createCampaign = (details: EmailCampaignDetails) =>
  EmailCampaignModel.create(details);

export const findCampaignById = (id: string) => EmailCampaignModel.findByPk(id);

export const listCampaigns = async (params: {
  page: number;
  limit: number;
  search?: string;
  status?: EmailCampaignStatus;
}) => {
  const where: Record<string | symbol, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${params.search}%` } },
      { subject: { [Op.iLike]: `%${params.search}%` } },
    ];
  }
  const { rows, count } = await EmailCampaignModel.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    offset: (params.page - 1) * params.limit,
    limit: params.limit,
  });
  return { rows, count };
};

export const updateCampaign = async (
  id: string,
  updates: Partial<EmailCampaignDetails>
) => {
  const campaign = await EmailCampaignModel.findByPk(id);
  if (!campaign) return null;
  await campaign.update(updates);
  return campaign;
};

export const softDeleteCampaign = async (id: string): Promise<boolean> => {
  const deleted = await EmailCampaignModel.destroy({ where: { id } });
  return deleted > 0;
};

// Atomic concurrency lock: a single conditional UPDATE flips lockedAt
// free -> held. If two worker ticks race, exactly one matches. A row is
// claimable when lockedAt is NULL or stale (a crashed run never released it).
export const claimCampaignLock = async (id: string): Promise<boolean> => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  const [claimed] = await EmailCampaignModel.update(
    { lockedAt: now },
    {
      where: {
        id,
        status: EmailCampaignStatus.RUNNING,
        [Op.or]: [{ lockedAt: null }, { lockedAt: { [Op.lt]: staleBefore } }],
      },
    }
  );
  return claimed === 1;
};

export const releaseCampaignLock = async (id: string): Promise<void> => {
  await EmailCampaignModel.update({ lockedAt: null }, { where: { id } });
};

export const findOldestRunningCampaign = () =>
  EmailCampaignModel.findOne({
    where: { status: EmailCampaignStatus.RUNNING },
    order: [["startedAt", "ASC"]],
  });

// ─── Recipients ──────────────────────────────────────────────────────────────

export const bulkInsertRecipients = (rows: EmailCampaignRecipientDetails[]) =>
  EmailCampaignRecipientModel.bulkCreate(rows, { ignoreDuplicates: true });

export const countRecipients = (campaignId: string) =>
  EmailCampaignRecipientModel.count({ where: { campaignId } });

export const deletePendingRecipients = (campaignId: string) =>
  EmailCampaignRecipientModel.destroy({
    where: { campaignId, status: EmailRecipientStatus.PENDING },
  });

export const getRecipientStatusCounts = async (
  campaignId: string
): Promise<RecipientStatusCounts> => {
  const grouped = (await EmailCampaignRecipientModel.findAll({
    where: { campaignId },
    attributes: ["status", [fn("COUNT", col("id")), "count"]],
    group: ["status"],
    raw: true,
  })) as unknown as { status: EmailRecipientStatus; count: string }[];

  const counts: RecipientStatusCounts = {
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };
  grouped.forEach((g) => {
    counts[g.status] = Number(g.count);
  });
  return counts;
};

export const listRecipients = async (
  campaignId: string,
  params: {
    page: number;
    limit: number;
    status?: EmailRecipientStatus;
    search?: string;
  }
) => {
  const where: Record<string, unknown> = { campaignId };
  if (params.status) where.status = params.status;
  if (params.search) where.email = { [Op.iLike]: `%${params.search}%` };
  const { rows, count } = await EmailCampaignRecipientModel.findAndCountAll({
    where,
    order: [["createdAt", "ASC"]],
    offset: (params.page - 1) * params.limit,
    limit: params.limit,
  });
  return { rows, count };
};

// Untried pending rows first, then retriable failures — same claim order as
// the legacy hoopr worker so retries never starve fresh sends.
export const findSendBatch = (
  campaignId: string,
  maxAttempts: number,
  limit: number
) =>
  EmailCampaignRecipientModel.findAll({
    where: {
      campaignId,
      [Op.or]: [
        { status: EmailRecipientStatus.PENDING },
        {
          status: EmailRecipientStatus.FAILED,
          attempts: { [Op.lt]: maxAttempts },
        },
      ],
    },
    order: [
      ["status", "ASC"],
      ["createdAt", "ASC"],
    ],
    limit,
  });

// Campaign sends across ALL campaigns in the rolling 24h window — used to
// respect the shared SES daily quota. (Transactional mail is not counted;
// dailyQuota defaults leave headroom for it.)
export const countSentInLast24h = () =>
  EmailCampaignRecipientModel.count({
    where: {
      status: EmailRecipientStatus.SENT,
      sentAt: { [Op.gt]: new Date(Date.now() - QUOTA_WINDOW_MS) },
    },
  });

export const findRecipientByMessageId = (messageId: string) =>
  EmailCampaignRecipientModel.findOne({ where: { messageId } });

// ─── Templates ───────────────────────────────────────────────────────────────

export const createTemplate = (details: EmailTemplateDetails) =>
  EmailTemplateModel.create(details);

export const findTemplateById = (id: string) => EmailTemplateModel.findByPk(id);

export const listTemplates = async (params: {
  page: number;
  limit: number;
  search?: string;
}) => {
  const where: Record<string, unknown> = {};
  if (params.search) where.name = { [Op.iLike]: `%${params.search}%` };
  const { rows, count } = await EmailTemplateModel.findAndCountAll({
    where,
    order: [["updatedAt", "DESC"]],
    offset: (params.page - 1) * params.limit,
    limit: params.limit,
  });
  return { rows, count };
};

export const updateTemplate = async (
  id: string,
  updates: Partial<EmailTemplateDetails>
) => {
  const template = await EmailTemplateModel.findByPk(id);
  if (!template) return null;
  await template.update(updates);
  return template;
};

export const softDeleteTemplate = async (id: string): Promise<boolean> => {
  const deleted = await EmailTemplateModel.destroy({ where: { id } });
  return deleted > 0;
};

// ─── Suppressions ────────────────────────────────────────────────────────────

export const upsertSuppression = async (details: EmailSuppressionDetails) => {
  const [row] = await EmailSuppressionModel.findOrCreate({
    where: { email: details.email },
    defaults: details,
  });
  return row;
};

export const listSuppressions = async (params: {
  page: number;
  limit: number;
  search?: string;
}) => {
  const where: Record<string, unknown> = {};
  if (params.search) where.email = { [Op.iLike]: `%${params.search}%` };
  const { rows, count } = await EmailSuppressionModel.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    offset: (params.page - 1) * params.limit,
    limit: params.limit,
  });
  return { rows, count };
};

export const deleteSuppressionById = async (id: string): Promise<boolean> => {
  const deleted = await EmailSuppressionModel.destroy({ where: { id } });
  return deleted > 0;
};

export const isEmailSuppressed = async (email: string): Promise<boolean> => {
  const found = await EmailSuppressionModel.findOne({ where: { email } });
  return found !== null;
};

// Returns the subset of `emails` present in the suppression list.
export const findSuppressedAmong = async (emails: string[]): Promise<Set<string>> => {
  if (!emails.length) return new Set();
  const rows = await EmailSuppressionModel.findAll({
    where: { email: { [Op.in]: emails } },
    attributes: ["email"],
    raw: true,
  });
  return new Set(rows.map((r) => r.email));
};

// ─── Events ──────────────────────────────────────────────────────────────────

export const createEmailEvent = (details: EmailEventDetails) =>
  EmailEventModel.create(details);

export const countEventsByType = async (
  campaignId: string
): Promise<Record<string, number>> => {
  const grouped = (await EmailEventModel.findAll({
    where: { campaignId },
    attributes: ["type", [fn("COUNT", col("id")), "count"]],
    group: ["type"],
    raw: true,
  })) as unknown as { type: string; count: string }[];
  return Object.fromEntries(grouped.map((g) => [g.type, Number(g.count)]));
};

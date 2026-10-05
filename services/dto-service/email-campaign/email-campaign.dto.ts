import type {
  EmailCampaignStatus,
  EmailRecipientStatus,
  EmailSuppressionReason,
} from "./email-campaign.enum";

// ─── Requests ────────────────────────────────────────────────────────────────

export interface CreateEmailCampaignRequestData {
  name: string;
  subject: string;
  html?: string;
  templateId?: string;
  dailyQuota?: number;
  ratePerSec?: number;
  batchSize?: number;
  maxAttempts?: number;
}

// POST /admin/email-campaigns/:id/duplicate. Everything not given is copied
// from the source campaign.
export interface DuplicateEmailCampaignRequestData {
  name?: string;
  subject?: string;
  /** Copy the source's recipient list too. Default true. */
  includeRecipients?: boolean;
}

export interface DuplicateEmailCampaignResult {
  campaign: unknown;
  sourceCampaignId: string;
  /** Recipients copied, as fresh `pending` rows. */
  copiedRecipients: number;
  /** Source recipients left out because they are now on the suppression list. */
  suppressedRecipients: number;
}

export interface UpdateEmailCampaignRequestData {
  name?: string;
  subject?: string;
  html?: string;
  dailyQuota?: number;
  ratePerSec?: number;
  batchSize?: number;
  maxAttempts?: number;
}

export interface ListEmailCampaignsQueryData {
  page?: number;
  limit?: number;
  search?: string;
  status?: EmailCampaignStatus;
}

export interface ListRecipientsQueryData {
  page?: number;
  limit?: number;
  status?: EmailRecipientStatus;
  search?: string;
}

export interface TestSendRequestData {
  emails: string[];
}

export interface CreateEmailTemplateRequestData {
  name: string;
  subject?: string;
  html: string;
  description?: string;
}

export interface UpdateEmailTemplateRequestData {
  name?: string;
  subject?: string;
  html?: string;
  description?: string;
}

export interface AddSuppressionRequestData {
  email: string;
  reason?: EmailSuppressionReason;
  detail?: string;
}

// ─── Responses ───────────────────────────────────────────────────────────────

export interface RecipientStatusCounts {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface CsvUploadSummary {
  parsedRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  suppressedRows: number;
  added: number;
  totalRecipients: number;
}

export interface EmailCampaignStats {
  campaign: {
    id: string;
    name: string;
    subject: string;
    status: EmailCampaignStatus;
    dailyQuota: number;
    ratePerSec: number;
    batchSize: number;
    startedAt: Date | null;
    completedAt: Date | null;
  };
  totalRecipients: number;
  counts: RecipientStatusCounts;
  bounces: number;
  complaints: number;
  progressPercent: number;
  sentInLast24h: number;
  remainingDailyQuota: number;
}

export interface ProcessBatchResult {
  processed: number;
  sent?: number;
  failed?: number;
  skipped?: number;
  suppressed?: number;
  campaignId?: string;
  message?: string;
  sentInLast24h?: number;
}

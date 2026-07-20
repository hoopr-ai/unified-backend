import Joi from "joi";
import {
  EmailCampaignStatus,
  EmailRecipientStatus,
  EmailSuppressionReason,
} from "../services/dto-service/email-campaign/modules.export";
import type {
  CreateEmailCampaignRequestData,
  UpdateEmailCampaignRequestData,
  ListEmailCampaignsQueryData,
  ListRecipientsQueryData,
  TestSendRequestData,
  CreateEmailTemplateRequestData,
  UpdateEmailTemplateRequestData,
  AddSuppressionRequestData,
} from "../services/dto-service/email-campaign/modules.export";

// SES account hard limits: 50,000/day and 14/sec. Campaign settings must stay
// below them so transactional mail keeps headroom.
const MAX_DAILY_QUOTA = 49000;
const MAX_RATE_PER_SEC = 13;

const tuningFields = {
  dailyQuota: Joi.number().integer().min(1).max(MAX_DAILY_QUOTA).optional(),
  ratePerSec: Joi.number().integer().min(1).max(MAX_RATE_PER_SEC).optional(),
  batchSize: Joi.number().integer().min(1).max(50000).optional(),
  maxAttempts: Joi.number().integer().min(1).max(5).optional(),
};

export const createCampaignRequestSchema = Joi.object<CreateEmailCampaignRequestData>({
  name: Joi.string().min(3).max(255).required(),
  subject: Joi.string().min(1).max(500).required(),
  html: Joi.string().min(1).optional(),
  templateId: Joi.string().uuid().optional(),
  ...tuningFields,
}).or("html", "templateId");

export const updateCampaignRequestSchema = Joi.object<UpdateEmailCampaignRequestData>({
  name: Joi.string().min(3).max(255).optional(),
  subject: Joi.string().min(1).max(500).optional(),
  html: Joi.string().min(1).optional(),
  ...tuningFields,
}).min(1);

export const listCampaignsQuerySchema = Joi.object<ListEmailCampaignsQueryData>({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  search: Joi.string().max(255).optional(),
  status: Joi.string()
    .valid(...Object.values(EmailCampaignStatus))
    .optional(),
});

export const listRecipientsQuerySchema = Joi.object<ListRecipientsQueryData>({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
  status: Joi.string()
    .valid(...Object.values(EmailRecipientStatus))
    .optional(),
  search: Joi.string().max(255).optional(),
});

export const testSendRequestSchema = Joi.object<TestSendRequestData>({
  emails: Joi.array()
    .items(Joi.string().email().lowercase())
    .min(1)
    .max(5)
    .required(),
});

export const createTemplateRequestSchema = Joi.object<CreateEmailTemplateRequestData>({
  name: Joi.string().min(3).max(255).required(),
  subject: Joi.string().max(500).optional(),
  html: Joi.string().min(1).required(),
  description: Joi.string().max(2000).allow("").optional(),
});

export const updateTemplateRequestSchema = Joi.object<UpdateEmailTemplateRequestData>({
  name: Joi.string().min(3).max(255).optional(),
  subject: Joi.string().max(500).allow("").optional(),
  html: Joi.string().min(1).optional(),
  description: Joi.string().max(2000).allow("").optional(),
}).min(1);

export const addSuppressionRequestSchema = Joi.object<AddSuppressionRequestData>({
  email: Joi.string().email().required(),
  reason: Joi.string()
    .valid(...Object.values(EmailSuppressionReason))
    .optional(),
  detail: Joi.string().max(2000).allow("").optional(),
});

export const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
  search: Joi.string().max(255).optional(),
});

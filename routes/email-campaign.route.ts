import { Router, text } from "express";
import {
  listEmailCampaigns,
  createEmailCampaign,
  getEmailCampaign,
  updateEmailCampaign,
  deleteEmailCampaign,
  uploadCampaignRecipients,
  clearCampaignRecipients,
  listCampaignRecipients,
  sendTestEmail,
  startEmailCampaign,
  pauseEmailCampaign,
  getEmailCampaignStats,
  listEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  listEmailSuppressions,
  addEmailSuppression,
  removeEmailSuppression,
  handleSesWebhook,
} from "../controllers/email-campaign.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { validateRequest } from "../middlewares/validateRequest";
import { singleRecipientsFileUpload } from "../middlewares/csv-upload";
import {
  createCampaignRequestSchema,
  updateCampaignRequestSchema,
  testSendRequestSchema,
  createTemplateRequestSchema,
  updateTemplateRequestSchema,
  addSuppressionRequestSchema,
} from "../middlewares/email-campaign.validation";
import { Platform, UserRoles } from "../services/dto-service/modules.export";

const adminAuth = [
  authenticateWithSession({
    roles: [UserRoles.ADMIN, UserRoles.MARKETING],
    platforms: [Platform.INTERNAL],
  }),
  requireFunctionality("email-campaigns"),
];

// ─── Campaigns router (mounted at /admin/email-campaigns) ────────────────────

export const emailCampaignRouter = Router();

emailCampaignRouter.get("/", ...adminAuth, listEmailCampaigns);
emailCampaignRouter.post(
  "/",
  ...adminAuth,
  validateRequest(createCampaignRequestSchema),
  createEmailCampaign
);
emailCampaignRouter.get("/:id", ...adminAuth, getEmailCampaign);
emailCampaignRouter.put(
  "/:id",
  ...adminAuth,
  validateRequest(updateCampaignRequestSchema),
  updateEmailCampaign
);
emailCampaignRouter.delete("/:id", ...adminAuth, deleteEmailCampaign);

emailCampaignRouter.post(
  "/:id/recipients",
  ...adminAuth,
  singleRecipientsFileUpload,
  uploadCampaignRecipients
);
emailCampaignRouter.delete("/:id/recipients", ...adminAuth, clearCampaignRecipients);
emailCampaignRouter.get("/:id/recipients", ...adminAuth, listCampaignRecipients);

emailCampaignRouter.post(
  "/:id/test-send",
  ...adminAuth,
  validateRequest(testSendRequestSchema),
  sendTestEmail
);
emailCampaignRouter.post("/:id/start", ...adminAuth, startEmailCampaign);
emailCampaignRouter.post("/:id/pause", ...adminAuth, pauseEmailCampaign);
emailCampaignRouter.get("/:id/stats", ...adminAuth, getEmailCampaignStats);

// ─── Templates router (mounted at /admin/email-templates) ────────────────────

export const emailTemplateRouter = Router();

emailTemplateRouter.get("/", ...adminAuth, listEmailTemplates);
emailTemplateRouter.post(
  "/",
  ...adminAuth,
  validateRequest(createTemplateRequestSchema),
  createEmailTemplate
);
emailTemplateRouter.get("/:id", ...adminAuth, getEmailTemplate);
emailTemplateRouter.put(
  "/:id",
  ...adminAuth,
  validateRequest(updateTemplateRequestSchema),
  updateEmailTemplate
);
emailTemplateRouter.delete("/:id", ...adminAuth, deleteEmailTemplate);

// ─── Suppressions router (mounted at /admin/email-suppressions) ──────────────

export const emailSuppressionRouter = Router();

emailSuppressionRouter.get("/", ...adminAuth, listEmailSuppressions);
emailSuppressionRouter.post(
  "/",
  ...adminAuth,
  validateRequest(addSuppressionRequestSchema),
  addEmailSuppression
);
emailSuppressionRouter.delete("/:id", ...adminAuth, removeEmailSuppression);

// ─── SES/SNS webhook router (mounted at /webhooks/ses) ───────────────────────
// Public endpoint — authenticity is enforced by SNS signature validation in
// the service. SNS posts with Content-Type text/plain, hence express.text().

export const sesWebhookRouter = Router();

sesWebhookRouter.post("/", text({ type: "*/*", limit: "1mb" }), handleSesWebhook);

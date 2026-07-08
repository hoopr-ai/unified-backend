import type { Request, Response } from "express";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";
import {
  createCampaignService,
  listCampaignsService,
  getCampaignService,
  updateCampaignService,
  deleteCampaignService,
  uploadRecipientsService,
  clearPendingRecipientsService,
  listRecipientsService,
  sendTestEmailService,
  startCampaignService,
  pauseCampaignService,
  getCampaignStatsService,
  listTemplatesService,
  getTemplateService,
  createTemplateService,
  updateTemplateService,
  deleteTemplateService,
  listSuppressionsService,
  addSuppressionService,
  removeSuppressionService,
  handleSnsMessageService,
} from "../services/business-service/email-campaign/modules.export";
import {
  listCampaignsQuerySchema,
  listRecipientsQuerySchema,
  listQuerySchema,
} from "../middlewares/email-campaign.validation";
import { triggerEmailCampaignTick } from "../services/scheduler-service/index";
import { logger } from "../services/helper-service/logger";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

const validateQuery = <T>(schema: { validate: Function }, query: unknown): T => {
  const { error, value } = schema.validate(query, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    throw new AppError(
      error.details.map((d: { message: string }) => d.message).join(", "),
      400
    );
  }
  return value as T;
};

// ─── Campaigns ───────────────────────────────────────────────────────────────

export const listEmailCampaigns = catchAsync(async (req: Request, res: Response) => {
  const query = validateQuery<Parameters<typeof listCampaignsService>[0]>(
    listCampaignsQuerySchema,
    req.query
  );
  const response = await listCampaignsService(query);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Campaigns fetched successfully",
  });
});

export const createEmailCampaign = catchAsync(async (req: AuthRequest, res: Response) => {
  const response = await createCampaignService(req.body, req.session?.userId);
  sendResponse(res, {
    status: HttpStatusCode.CREATED,
    data: response,
    message: "Campaign created successfully",
  });
});

export const getEmailCampaign = catchAsync(async (req: Request, res: Response) => {
  const response = await getCampaignService(req.params.id as string);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Campaign fetched successfully",
  });
});

export const updateEmailCampaign = catchAsync(async (req: Request, res: Response) => {
  const response = await updateCampaignService(req.params.id as string, req.body);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Campaign updated successfully",
  });
});

export const deleteEmailCampaign = catchAsync(async (req: Request, res: Response) => {
  await deleteCampaignService(req.params.id as string);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: null,
    message: "Campaign deleted successfully",
  });
});

// ─── Recipients ──────────────────────────────────────────────────────────────

export const uploadCampaignRecipients = catchAsync(async (req: Request, res: Response) => {
  if (!req.file?.buffer) {
    throw new AppError('Attach a CSV/XLSX file under the "file" field', 400);
  }
  const response = await uploadRecipientsService(
    req.params.id as string,
    req.file.buffer
  );
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Recipients uploaded successfully",
  });
});

export const clearCampaignRecipients = catchAsync(async (req: Request, res: Response) => {
  const response = await clearPendingRecipientsService(req.params.id as string);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Pending recipients cleared",
  });
});

export const listCampaignRecipients = catchAsync(async (req: Request, res: Response) => {
  const query = validateQuery<Parameters<typeof listRecipientsService>[1]>(
    listRecipientsQuerySchema,
    req.query
  );
  const response = await listRecipientsService(req.params.id as string, query);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Recipients fetched successfully",
  });
});

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export const sendTestEmail = catchAsync(async (req: Request, res: Response) => {
  const response = await sendTestEmailService(req.params.id as string, req.body.emails);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Test emails processed",
  });
});

export const startEmailCampaign = catchAsync(async (req: Request, res: Response) => {
  const response = await startCampaignService(req.params.id as string);
  // Kick the worker so the first batch goes out now, not at the next tick.
  // Redis being down must not fail the start — the minute tick will pick it up.
  try {
    await triggerEmailCampaignTick();
  } catch (err) {
    logger.error("[EmailCampaign] Could not trigger immediate tick:", err);
  }
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Campaign started",
  });
});

export const pauseEmailCampaign = catchAsync(async (req: Request, res: Response) => {
  const response = await pauseCampaignService(req.params.id as string);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Campaign paused",
  });
});

export const getEmailCampaignStats = catchAsync(async (req: Request, res: Response) => {
  const response = await getCampaignStatsService(req.params.id as string);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Stats fetched successfully",
  });
});

// ─── Templates ───────────────────────────────────────────────────────────────

export const listEmailTemplates = catchAsync(async (req: Request, res: Response) => {
  const query = validateQuery<Parameters<typeof listTemplatesService>[0]>(
    listQuerySchema,
    req.query
  );
  const response = await listTemplatesService(query);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Templates fetched successfully",
  });
});

export const getEmailTemplate = catchAsync(async (req: Request, res: Response) => {
  const response = await getTemplateService(req.params.id as string);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Template fetched successfully",
  });
});

export const createEmailTemplate = catchAsync(async (req: AuthRequest, res: Response) => {
  const response = await createTemplateService(req.body, req.session?.userId);
  sendResponse(res, {
    status: HttpStatusCode.CREATED,
    data: response,
    message: "Template created successfully",
  });
});

export const updateEmailTemplate = catchAsync(async (req: Request, res: Response) => {
  const response = await updateTemplateService(req.params.id as string, req.body);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Template updated successfully",
  });
});

export const deleteEmailTemplate = catchAsync(async (req: Request, res: Response) => {
  await deleteTemplateService(req.params.id as string);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: null,
    message: "Template deleted successfully",
  });
});

// ─── Suppressions ────────────────────────────────────────────────────────────

export const listEmailSuppressions = catchAsync(async (req: Request, res: Response) => {
  const query = validateQuery<Parameters<typeof listSuppressionsService>[0]>(
    listQuerySchema,
    req.query
  );
  const response = await listSuppressionsService(query);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Suppressions fetched successfully",
  });
});

export const addEmailSuppression = catchAsync(async (req: AuthRequest, res: Response) => {
  const response = await addSuppressionService(req.body, req.session?.userId);
  sendResponse(res, {
    status: HttpStatusCode.CREATED,
    data: response,
    message: "Email suppressed",
  });
});

export const removeEmailSuppression = catchAsync(async (req: Request, res: Response) => {
  await removeSuppressionService(req.params.id as string);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: null,
    message: "Suppression removed",
  });
});

// ─── SES / SNS webhook ───────────────────────────────────────────────────────

export const handleSesWebhook = catchAsync(async (req: Request, res: Response) => {
  // Body arrives as text (SNS posts text/plain); express.text() mounted on the
  // webhook route keeps app-level express.json() out of the way.
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  await handleSnsMessageService(raw);
  res.status(200).send("ok");
});

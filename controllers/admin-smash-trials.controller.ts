import type { Request, Response } from "express";
import type Joi from "joi";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import type { SessionPayload } from "../middlewares/authenticate";
import {
  listTrialsQuerySchema,
  trialBrandIdParamSchema,
  trialFunnelQuerySchema,
} from "../middlewares/admin-smash-trials.validation";
import {
  extendTrialService,
  listTrialsService,
} from "../services/business-service/trial/trial.service";
import {
  getTrialFunnelService,
  listJourneySendsService,
} from "../services/business-service/trial/trial-journey.service";
import { triggerTrialJourneyTick } from "../services/scheduler-service";
import { DAY_MS } from "../services/dto-service/trial/trial.dto";

// Internal CMS for Smash trials: who is on one, where they stand, and the
// discretionary +2 credit extension.

interface AuthRequest extends Request {
  session?: SessionPayload;
}

const validate = <T>(schema: Joi.ObjectSchema, payload: unknown): T => {
  const { value, error } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    throw new AppError(error.details.map((d) => d.message).join(", "), 400);
  }
  return value as T;
};

// GET /admin/smash-trials
export const getTrials = catchAsync(async (req: AuthRequest, res: Response) => {
  const query = validate<{ page: number; limit: number; search?: string }>(
    listTrialsQuerySchema,
    req.query,
  );
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: await listTrialsService(query),
    message: ResponseMessages.ListTrialsSuccess,
  });
});

// POST /admin/smash-trials/:brandId/extend — once per brand; 409 on repeat.
// The granting admin comes from the verified session, never the body.
export const extendTrial = catchAsync(async (req: AuthRequest, res: Response) => {
  const { brandId } = validate<{ brandId: number }>(trialBrandIdParamSchema, req.params);
  const adminUserId = req.session?.userId;
  if (!adminUserId) throw new AppError("Unauthorized", 401);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: await extendTrialService(brandId, adminUserId),
    message: ResponseMessages.ExtendTrialSuccess,
  });
});

// GET /admin/smash-trials/funnel — Day-7 measurement for trials started in
// [from, to): stage counts + drop-off, Day-7 segments, signup source split.
export const getTrialFunnel = catchAsync(async (req: AuthRequest, res: Response) => {
  const query = validate<{ from?: Date; to?: Date }>(trialFunnelQuerySchema, req.query);
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - 30 * DAY_MS);
  if (from >= to) throw new AppError("`from` must be before `to`", 400);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: await getTrialFunnelService(from, to),
    message: ResponseMessages.TrialFunnelSuccess,
  });
});

// GET /admin/smash-trials/:brandId/journey — every email/push/alert the
// journey sent this brand, with open/click times.
export const getTrialJourney = catchAsync(async (req: AuthRequest, res: Response) => {
  const { brandId } = validate<{ brandId: number }>(trialBrandIdParamSchema, req.params);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: { sends: await listJourneySendsService(brandId) },
    message: ResponseMessages.TrialJourneySendsSuccess,
  });
});

// POST /admin/smash-trials/journey/run — queue a tick now instead of waiting
// for the 10-minute schedule. Safe to repeat: every slot is claimed once.
export const runTrialJourney = catchAsync(async (_req: AuthRequest, res: Response) => {
  await triggerTrialJourneyTick();
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: { queued: true },
    message: ResponseMessages.TrialJourneyRunQueued,
  });
});

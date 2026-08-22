import type { Request, Response } from "express";
import type Joi from "joi";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";
import {
  channelExportQuerySchema,
  channelIdParamSchema,
  channelListQuerySchema,
  claimExportQuerySchema,
  claimIdParamSchema,
  claimListQuerySchema,
  updateChannelBodySchema,
  updateClaimBodySchema,
} from "../middlewares/admin-whitelisting.validation";
import {
  channelHistoryService,
  channelsMetaService,
  claimHistoryService,
  claimsMetaService,
  exportChannelsCsvService,
  exportClaimsCsvService,
  getChannelService,
  getClaimService,
  listChannelsService,
  listClaimsService,
  updateChannelStatusService,
  updateClaimStatusService,
  type Actor,
  type ChannelFilters,
  type ClaimFilters,
  type UpdateChannelInput,
  type UpdateClaimInput,
} from "../services/business-service/whitelisting/modules.export";

// Endpoints backing internal-fe's "YouTube Whitelisting" CMS — two surfaces,
// Channel Whitelisting and Claim Clearance, over the shared Postgres.
//
// Reads are GETs validated against req.query; the two writes are PATCHes
// validated against req.body. Same validate()/ok() shape as
// admin-native-analytics.controller.ts.

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

const ok = (res: Response, data: unknown, message: string) =>
  sendResponse(res, { status: HttpStatusCode.OK, data, message });

/**
 * The operator, from the VERIFIED session — never from the body.
 *
 * This is what lands in whitelist_audit."actorEmail", so it is the answer to
 * "who cleared this channel". A client-supplied actor would make the audit
 * trail worse than useless: trusted, and forgeable.
 *
 * The email is snapshotted onto the audit row rather than joined at read time
 * because internal staff accounts get deactivated, and history must survive the
 * person leaving.
 */
const actorOf = (req: AuthRequest): Actor => {
  const session = req.session;
  if (!session?.userId) throw new AppError("Unauthorized", 401);
  return { userId: session.userId, email: session.email ?? null };
};

// Content-Disposition takes an operator-influenced filename only through this
// builder, which emits nothing but [a-z0-9-] plus the extension.
const csvFilename = (base: string): string =>
  `${base}-${new Date().toISOString().slice(0, 10)}.csv`;

const sendCsv = (res: Response, filename: string, body: string) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // Excel opens a UTF-8 CSV as Latin-1 unless it sees a BOM, which turns every
  // creator name with an accent into mojibake on the ops team's machines.
  res.status(HttpStatusCode.OK).send(`﻿${body}`);
};

// ── Channel Whitelisting ────────────────────────────────────────────────────

export const getWhitelistChannels = catchAsync(
  async (req: Request, res: Response) => {
    const filters = validate<ChannelFilters>(channelListQuerySchema, req.query);
    ok(res, await listChannelsService(filters), "Channels fetched successfully");
  },
);

// Declared before the ':profileId' routes in the router — see the note there.
export const getWhitelistChannelsMeta = catchAsync(
  async (_req: Request, res: Response) => {
    ok(res, await channelsMetaService(), "Channel metadata fetched successfully");
  },
);

export const getWhitelistChannelsCsv = catchAsync(
  async (req: Request, res: Response) => {
    const filters = validate<ChannelFilters>(channelExportQuerySchema, req.query);
    sendCsv(
      res,
      csvFilename("channel-whitelisting"),
      await exportChannelsCsvService(filters),
    );
  },
);

export const getWhitelistChannel = catchAsync(
  async (req: Request, res: Response) => {
    const { profileId } = validate<{ profileId: number }>(
      channelIdParamSchema,
      req.params,
    );
    ok(res, await getChannelService(profileId), "Channel fetched successfully");
  },
);

export const getWhitelistChannelHistory = catchAsync(
  async (req: Request, res: Response) => {
    const { profileId } = validate<{ profileId: number }>(
      channelIdParamSchema,
      req.params,
    );
    ok(
      res,
      await channelHistoryService(profileId),
      "Channel history fetched successfully",
    );
  },
);

export const patchWhitelistChannel = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { profileId } = validate<{ profileId: number }>(
      channelIdParamSchema,
      req.params,
    );
    const body = validate<UpdateChannelInput>(updateChannelBodySchema, req.body);
    ok(
      res,
      await updateChannelStatusService(profileId, body, actorOf(req)),
      "Channel whitelisting updated",
    );
  },
);

// ── Claim Clearance ─────────────────────────────────────────────────────────

export const getWhitelistClaims = catchAsync(
  async (req: Request, res: Response) => {
    const filters = validate<ClaimFilters>(claimListQuerySchema, req.query);
    ok(res, await listClaimsService(filters), "Claims fetched successfully");
  },
);

export const getWhitelistClaimsMeta = catchAsync(
  async (_req: Request, res: Response) => {
    ok(res, await claimsMetaService(), "Claim metadata fetched successfully");
  },
);

export const getWhitelistClaimsCsv = catchAsync(
  async (req: Request, res: Response) => {
    const filters = validate<ClaimFilters>(claimExportQuerySchema, req.query);
    sendCsv(res, csvFilename("claim-clearance"), await exportClaimsCsvService(filters));
  },
);

export const getWhitelistClaim = catchAsync(async (req: Request, res: Response) => {
  const { id } = validate<{ id: string }>(claimIdParamSchema, req.params);
  ok(res, await getClaimService(id), "Claim fetched successfully");
});

export const getWhitelistClaimHistory = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = validate<{ id: string }>(claimIdParamSchema, req.params);
    ok(res, await claimHistoryService(id), "Claim history fetched successfully");
  },
);

export const patchWhitelistClaim = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { id } = validate<{ id: string }>(claimIdParamSchema, req.params);
    const body = validate<UpdateClaimInput>(updateClaimBodySchema, req.body);
    ok(
      res,
      await updateClaimStatusService(id, body, actorOf(req)),
      "Claim updated",
    );
  },
);

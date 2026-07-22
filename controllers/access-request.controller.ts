import type { Request, Response } from "express";
import {
  catchAsync,
  sendResponse,
  AppError,
  getClientIp,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  listApprovableAdminsService,
  createAccessRequestService,
  listMyAccessRequestsService,
  listAccessRequestsForAdminService,
  approveAccessRequestService,
  rejectAccessRequestService,
} from "../services/business-service/admin-internal-users/modules.export";
import type { AccessRequestStatus } from "../services/persistence-service/user/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

const requireActor = (
  req: AuthRequest
): { actorId: number; actorSessionId: number } => {
  const actorId = req.session?.userId;
  const actorSessionId = req.session?.sessionId;
  if (!actorId || !actorSessionId) {
    throw new AppError("Unauthorized", 401);
  }
  return { actorId, actorSessionId };
};

const parseRequestId = (req: AuthRequest): number => {
  const id = parseInt(
    typeof req.params.id === "string" ? req.params.id : "",
    10
  );
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError("Invalid access request id.", 400);
  }
  return id;
};

const VALID_STATUSES: AccessRequestStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

const parseStatus = (req: AuthRequest): AccessRequestStatus | undefined => {
  const raw = req.query.status;
  if (typeof raw !== "string" || raw === "") return undefined;
  const upper = raw.toUpperCase() as AccessRequestStatus;
  if (!VALID_STATUSES.includes(upper)) {
    throw new AppError("Invalid status filter.", 400);
  }
  return upper;
};

const actorCtx = (req: AuthRequest, actorId: number, actorSessionId: number) => ({
  actorId,
  actorSessionId,
  ip: getClientIp(req),
  endpoint: req.originalUrl,
  method: req.method,
});

// GET /admin/internal-users/admins — any internal user (for the request picker).
export const listApprovableAdmins = catchAsync(
  async (_req: AuthRequest, res: Response) => {
    const admins = await listApprovableAdminsService();
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { admins },
      message: "Admins fetched.",
    });
  }
);

// POST /admin/internal-users/access-requests — any internal user creates a request.
export const createAccessRequest = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { actorId, actorSessionId } = requireActor(req);
    const result = await createAccessRequestService(
      actorId,
      {
        functionalities: req.body.functionalities,
        adminIds: req.body.adminIds,
        note: req.body.note,
      },
      actorCtx(req, actorId, actorSessionId)
    );
    sendResponse(res, {
      status: HttpStatusCode.CREATED,
      data: result,
      message: "Access request submitted.",
    });
  }
);

// GET /admin/internal-users/access-requests/mine — caller's own requests.
export const listMyAccessRequests = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { actorId } = requireActor(req);
    const requests = await listMyAccessRequestsService(actorId, parseStatus(req));
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { requests },
      message: "Access requests fetched.",
    });
  }
);

// GET /admin/internal-users/access-requests — for approvers (admins or holders
// of the internal-users functionality). Defaults to PENDING when no filter.
export const listAccessRequests = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { actorId } = requireActor(req);
    const status = parseStatus(req) ?? "PENDING";
    const requests = await listAccessRequestsForAdminService(actorId, status);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { requests },
      message: "Access requests fetched.",
    });
  }
);

// POST /admin/internal-users/access-requests/:id/approve
export const approveAccessRequest = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { actorId, actorSessionId } = requireActor(req);
    const id = parseRequestId(req);
    const result = await approveAccessRequestService(
      id,
      actorCtx(req, actorId, actorSessionId)
    );
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: result,
      message: "Access request approved.",
    });
  }
);

// POST /admin/internal-users/access-requests/:id/reject
export const rejectAccessRequest = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { actorId, actorSessionId } = requireActor(req);
    const id = parseRequestId(req);
    const result = await rejectAccessRequestService(
      id,
      actorCtx(req, actorId, actorSessionId),
      typeof req.body?.reviewNote === "string" ? req.body.reviewNote : undefined
    );
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: result,
      message: "Access request rejected.",
    });
  }
);

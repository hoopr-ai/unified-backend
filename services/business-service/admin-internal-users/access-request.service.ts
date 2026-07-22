import { AppError } from "../../helper-service/AppError";
import {
  createAccessRequest,
  findAccessRequestById,
  findAccessRequestsForAdmin,
  findAccessRequestsForRequester,
  updateAccessRequestStatus,
  findActiveInternalAdmins,
  filterActiveAdminIds,
  findInternalUserById,
  findUserRoleWithRestrictions,
  updateInternalUserFunctionalities,
  type AccessRequestModel,
  type AccessRequestStatus,
} from "../../persistence-service/user/modules.export";
import { recordInternalUserAudit } from "./audit.helper";

// Self-service access-request flow. See docs/ACCESS-MODEL.md.
//
// Deliberately NO catalog restriction on which functionality ids can be
// requested or granted — every functionality is shareable, including admin
// ones. Do not reintroduce a whitelist.

interface ActorContext {
  actorId: number;
  actorSessionId: number;
  ip?: string;
  endpoint: string;
  method: string;
}

// Shape returned to the FE. Dates are ISO strings; requester identity is
// flattened for the admin review table.
export interface AccessRequestDTO {
  id: number;
  requesterUserId: number;
  requester: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    role: string | null;
  } | null;
  functionalities: string[];
  adminIds: number[];
  note: string | null;
  status: AccessRequestStatus;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string | null;
}

interface RequesterInclude {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  userRoles?: { role: string }[];
}

const toDTO = (row: AccessRequestModel): AccessRequestDTO => {
  const req = (row as unknown as { requester?: RequesterInclude }).requester;
  return {
    id: row.id,
    requesterUserId: row.requesterUserId,
    requester: req
      ? {
          id: req.id,
          email: req.email,
          firstName: req.firstName,
          lastName: req.lastName,
          role: req.userRoles?.[0]?.role ?? null,
        }
      : null,
    functionalities: row.functionalities ?? [],
    adminIds: row.adminIds ?? [],
    note: row.note ?? null,
    status: row.status,
    reviewedByUserId: row.reviewedByUserId ?? null,
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null,
    reviewNote: row.reviewNote ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
};

// ── Admins list (for the requester's "who to ask" picker) ──────────────────
export const listApprovableAdminsService = async (): Promise<
  { id: number; email: string; firstName: string; lastName: string }[]
> => {
  return findActiveInternalAdmins();
};

// ── Create ─────────────────────────────────────────────────────────────────
export interface CreateAccessRequestInput {
  functionalities: string[];
  adminIds: number[];
  note?: string | null;
}

export const createAccessRequestService = async (
  requesterUserId: number,
  input: CreateAccessRequestInput,
  actor: ActorContext
): Promise<AccessRequestDTO> => {
  const requester = await findInternalUserById(requesterUserId);
  if (!requester) {
    throw new AppError("Requester not found.", 404);
  }

  const functionalities = Array.from(
    new Set((input.functionalities ?? []).map((f) => f.trim()).filter(Boolean))
  );
  if (functionalities.length === 0) {
    throw new AppError("Select at least one functionality to request.", 400);
  }

  // Keep only ids that are genuinely active INTERNAL admins.
  const validAdminIds = await filterActiveAdminIds(
    Array.from(new Set(input.adminIds ?? []))
  );
  if (validAdminIds.length === 0) {
    throw new AppError("Select at least one valid admin to request from.", 400);
  }

  const row = await createAccessRequest({
    requesterUserId,
    functionalities,
    adminIds: validAdminIds,
    note: input.note?.trim() ? input.note.trim() : null,
  });

  recordInternalUserAudit({
    actorId: actor.actorId,
    actorSessionId: actor.actorSessionId,
    action: "create_access_request",
    targetUserId: requesterUserId,
    ipAddress: actor.ip,
    endpoint: actor.endpoint,
    method: actor.method,
  });

  return toDTO(row);
};

// ── Lists ───────────────────────────────────────────────────────────────────
export const listMyAccessRequestsService = async (
  requesterUserId: number,
  status?: AccessRequestStatus
): Promise<AccessRequestDTO[]> => {
  const rows = await findAccessRequestsForRequester({ requesterUserId, status });
  return rows.map(toDTO);
};

export const listAccessRequestsForAdminService = async (
  adminId: number,
  status?: AccessRequestStatus
): Promise<AccessRequestDTO[]> => {
  const rows = await findAccessRequestsForAdmin({ adminId, status });
  return rows.map(toDTO);
};

// ── Approve / Reject ─────────────────────────────────────────────────────────
const loadPending = async (requestId: number): Promise<AccessRequestModel> => {
  const row = await findAccessRequestById(requestId);
  if (!row) throw new AppError("Access request not found.", 404);
  if (row.status !== "PENDING") {
    throw new AppError(
      `This request has already been ${row.status.toLowerCase()}.`,
      409
    );
  }
  return row;
};

export const approveAccessRequestService = async (
  requestId: number,
  actor: ActorContext
): Promise<AccessRequestDTO> => {
  const row = await loadPending(requestId);

  // Merge the requested ids into the requester's live grant list.
  const { role, functionalities: current } = await findUserRoleWithRestrictions(
    row.requesterUserId
  );
  // Admins already have everything by role; approving just closes the request.
  if (role !== "ADMIN") {
    const merged = Array.from(new Set([...current, ...(row.functionalities ?? [])]));
    await updateInternalUserFunctionalities(row.requesterUserId, merged);
  }

  await updateAccessRequestStatus(requestId, {
    status: "APPROVED",
    reviewedByUserId: actor.actorId,
    reviewedAt: new Date(),
  });

  recordInternalUserAudit({
    actorId: actor.actorId,
    actorSessionId: actor.actorSessionId,
    action: "approve_access_request",
    targetUserId: row.requesterUserId,
    ipAddress: actor.ip,
    endpoint: actor.endpoint,
    method: actor.method,
  });

  const updated = await findAccessRequestById(requestId);
  return toDTO(updated ?? row);
};

export const rejectAccessRequestService = async (
  requestId: number,
  actor: ActorContext,
  reviewNote?: string
): Promise<AccessRequestDTO> => {
  const row = await loadPending(requestId);

  await updateAccessRequestStatus(requestId, {
    status: "REJECTED",
    reviewedByUserId: actor.actorId,
    reviewedAt: new Date(),
    reviewNote: reviewNote?.trim() ? reviewNote.trim() : null,
  });

  recordInternalUserAudit({
    actorId: actor.actorId,
    actorSessionId: actor.actorSessionId,
    action: "reject_access_request",
    targetUserId: row.requesterUserId,
    ipAddress: actor.ip,
    endpoint: actor.endpoint,
    method: actor.method,
  });

  const updated = await findAccessRequestById(requestId);
  return toDTO(updated ?? row);
};

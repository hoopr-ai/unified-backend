import { Op } from "sequelize";
import { Platform, UserRoles, UserStatus } from "../../dto-service/modules.export";
import {
  AccessRequestModel,
  UserModel,
  UserRoleModel,
  type AccessRequestDetails,
  type AccessRequestStatus,
} from "./schemas/modules.export";

// Persistence for self-service CMS access requests. See access-request.schema.ts.

export const createAccessRequest = async (
  data: Pick<
    AccessRequestDetails,
    "requesterUserId" | "functionalities" | "adminIds" | "note"
  >
): Promise<AccessRequestModel> => {
  return AccessRequestModel.create({
    requesterUserId: data.requesterUserId,
    functionalities: data.functionalities,
    adminIds: data.adminIds,
    note: data.note ?? null,
    status: "PENDING",
  });
};

export const findAccessRequestById = async (
  id: number
): Promise<AccessRequestModel | null> => {
  return AccessRequestModel.findByPk(id);
};

// Requests visible to a given admin: those that targeted them (adminIds @> [id])
// OR — because any admin may act — all PENDING requests. Newest first.
// Includes the requester's basic identity for the review UI.
export const findAccessRequestsForAdmin = async (params: {
  adminId: number;
  status?: AccessRequestStatus;
}): Promise<AccessRequestModel[]> => {
  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  return AccessRequestModel.findAll({
    where,
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: UserModel,
        as: "requester",
        attributes: ["id", "email", "firstName", "lastName"],
        include: [
          {
            model: UserRoleModel,
            as: "userRoles",
            where: { status: UserStatus.ACTIVE },
            required: false,
            attributes: ["role"],
          },
        ],
      },
    ],
  });
};

export const findAccessRequestsForRequester = async (params: {
  requesterUserId: number;
  status?: AccessRequestStatus;
}): Promise<AccessRequestModel[]> => {
  const where: Record<string, unknown> = {
    requesterUserId: params.requesterUserId,
  };
  if (params.status) where.status = params.status;
  return AccessRequestModel.findAll({
    where,
    order: [["createdAt", "DESC"]],
  });
};

export const updateAccessRequestStatus = async (
  id: number,
  patch: {
    status: AccessRequestStatus;
    reviewedByUserId: number;
    reviewedAt: Date;
    reviewNote?: string | null;
  }
): Promise<boolean> => {
  const [affected] = await AccessRequestModel.update(
    {
      status: patch.status,
      reviewedByUserId: patch.reviewedByUserId,
      reviewedAt: patch.reviewedAt,
      reviewNote: patch.reviewNote ?? null,
    },
    { where: { id } }
  );
  return affected > 0;
};

// All active INTERNAL admins — used to populate the "which admin to ask" picker
// for a non-admin requester (who can't call the admin-only list endpoint).
export const findActiveInternalAdmins = async (): Promise<
  { id: number; email: string; firstName: string; lastName: string }[]
> => {
  const rows = await UserModel.findAll({
    where: { platform: Platform.INTERNAL, status: UserStatus.ACTIVE },
    attributes: ["id", "email", "firstName", "lastName"],
    order: [["firstName", "ASC"]],
    include: [
      {
        model: UserRoleModel,
        as: "userRoles",
        where: { status: UserStatus.ACTIVE, role: UserRoles.ADMIN },
        required: true,
        attributes: [],
      },
    ],
  });
  return rows.map((r) => ({
    id: r.id,
    email: r.email ?? "",
    firstName: r.firstName ?? "",
    lastName: r.lastName ?? "",
  }));
};

// Given a set of ids, return those that are active INTERNAL admins — used to
// validate a requester's chosen approvers.
export const filterActiveAdminIds = async (
  ids: number[]
): Promise<number[]> => {
  if (ids.length === 0) return [];
  const rows = await UserModel.findAll({
    where: { id: { [Op.in]: ids }, platform: Platform.INTERNAL, status: UserStatus.ACTIVE },
    attributes: ["id"],
    include: [
      {
        model: UserRoleModel,
        as: "userRoles",
        where: { status: UserStatus.ACTIVE, role: UserRoles.ADMIN },
        required: true,
        attributes: [],
      },
    ],
  });
  return rows.map((r) => r.id);
};

import { Op } from "sequelize";
import { Platform, UserStatus, type UserRoles } from "../../dto-service/modules.export";
import { UserModel, UserRoleModel, type UserDetails, type UserRoleDetails } from "./schemas/modules.export";

// Lookup helpers used by the INTERNAL admin CMS only.
// Filtering on platform='INTERNAL' is enforced at every entry point so these can never
// accidentally read or mutate ENTERPRISE / SOUND_TRACKING_APP / STUDIO rows.

// Case-insensitive lookup for uniqueness check on create.
// Matches any status (ACTIVE / INVITED / DELETED) — duplicates against any of those
// should 409 (we don't auto-reactivate former employees in v1).
export const findInternalUserByEmailCI = async (
  email: string
): Promise<UserDetails | null> => {
  return UserModel.findOne({
    where: {
      platform: Platform.INTERNAL,
      email: { [Op.iLike]: email.trim() },
    },
  });
};

export const findInternalUserById = async (
  userId: number
): Promise<UserDetails | null> => {
  return UserModel.findOne({
    where: { id: userId, platform: Platform.INTERNAL },
  });
};

export const updateInternalUserPassword = async (
  userId: number,
  hashedPassword: string
): Promise<void> => {
  await UserModel.update(
    { password: hashedPassword },
    { where: { id: userId, platform: Platform.INTERNAL } }
  );
};

interface FindInternalUsersParams {
  page: number;
  limit: number;
  search?: string;
  role?: UserRoles;
}

// Paginated list for GET /admin/internal-users.
// search → ILIKE on firstName | lastName | email
// role  → joined filter on user_roles (status=ACTIVE)
// Always pulls the active role + lastLoginAt for the FE list view.
export const findInternalUsersPaginated = async (
  params: FindInternalUsersParams
): Promise<{
  rows: (UserDetails & { userRoles?: UserRoleDetails[] })[];
  count: number;
}> => {
  const { page, limit, search, role } = params;
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = { platform: Platform.INTERNAL };
  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    where[Op.or as unknown as string] = [
      { firstName: { [Op.iLike]: term } },
      { lastName: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
    ];
  }

  const { rows, count } = await UserModel.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    attributes: [
      "id",
      "email",
      "firstName",
      "lastName",
      "mobile",
      "status",
      "createdAt",
      "lastLoginAt",
    ],
    include: [
      {
        model: UserRoleModel,
        as: "userRoles",
        where: role
          ? { status: UserStatus.ACTIVE, role }
          : { status: UserStatus.ACTIVE },
        // role filter must reduce the result set — otherwise required:false (LEFT JOIN)
        // would return users without a matching active role.
        required: !!role,
        attributes: ["role"],
      },
    ],
    distinct: true,
  });

  return {
    rows: rows as (UserDetails & { userRoles?: UserRoleDetails[] })[],
    count,
  };
};

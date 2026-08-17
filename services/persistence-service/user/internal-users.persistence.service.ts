import { Op } from "sequelize";
import { Platform, UserStatus, type UserRoles } from "../../dto-service/modules.export";
import { UserModel, UserRoleModel, type UserDetails, type UserRoleDetails } from "./schemas/modules.export";

// Lookup helpers used by the INTERNAL admin CMS only.
// Filtering on platform='INTERNAL' is enforced at every entry point so these can never
// accidentally read or mutate ENTERPRISE / CREATOR / STUDIO rows.

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

// Soft deactivate. Sets status=DELETED so login (which filters status IN [ACTIVE, INVITED])
// rejects them automatically. Also marks their user_roles inactive so any future reactivation
// is explicit. Returns true if a row was actually changed.
export const deactivateInternalUserById = async (
  userId: number
): Promise<boolean> => {
  const [affectedUserRows] = await UserModel.update(
    { status: UserStatus.DELETED },
    {
      where: {
        id: userId,
        platform: Platform.INTERNAL,
        status: { [Op.ne]: UserStatus.DELETED },
      },
    }
  );
  await UserRoleModel.update(
    { status: UserStatus.DELETED },
    { where: { userId, status: UserStatus.ACTIVE } }
  );
  return affectedUserRows > 0;
};

// Replace the functionality grant list on a user's active role row. Returns true if a row
// was changed. Caller is responsible for confirming the target is an INTERNAL user first.
export const updateInternalUserFunctionalities = async (
  userId: number,
  functionalities: string[]
): Promise<boolean> => {
  const [affected] = await UserRoleModel.update(
    { restrictions: { functionalities } },
    { where: { userId, status: UserStatus.ACTIVE } }
  );
  return affected > 0;
};

// Reactivate a previously deactivated INTERNAL user. Restores status=ACTIVE on the user row
// and on whatever role row was active when they were deactivated. Returns true if changed.
export const reactivateInternalUserById = async (
  userId: number
): Promise<boolean> => {
  const [affectedUserRows] = await UserModel.update(
    { status: UserStatus.ACTIVE },
    {
      where: {
        id: userId,
        platform: Platform.INTERNAL,
        status: UserStatus.DELETED,
      },
    }
  );
  // The deactivate flow flipped role status to DELETED for matching rows. Flip them back.
  await UserRoleModel.update(
    { status: UserStatus.ACTIVE },
    { where: { userId, status: UserStatus.DELETED } }
  );
  return affectedUserRows > 0;
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
        attributes: ["role", "restrictions"],
      },
    ],
    distinct: true,
  });

  return {
    rows: rows as (UserDetails & { userRoles?: UserRoleDetails[] })[],
    count,
  };
};

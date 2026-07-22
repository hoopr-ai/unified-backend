import bcrypt from "bcrypt";
import { UniqueConstraintError } from "sequelize";
import {
  Platform,
  UserRoles,
  UserStatus,
} from "../../dto-service/modules.export";
import { AppError } from "../../helper-service/AppError";
import {
  findInternalUserByEmailCI,
  findInternalUserById,
  findInternalUsersPaginated,
  deactivateInternalUserById,
  reactivateInternalUserById,
  saveUser,
  saveUserRole,
  findUserRole,
  findUserRoleWithRestrictions,
  updateInternalUserFunctionalities,
  deactivateAllUserSessions,
  type UserDetails,
  type UserRoleDetails,
} from "../../persistence-service/user/modules.export";
import { extractFunctionalities } from "./functionalities";
import { generateInternalUserPassword } from "./password.helper";
import { sendInternalUserWelcomeEmail } from "./email.helper";
import { recordInternalUserAudit } from "./audit.helper";

const INTERNAL_CMS_URL =
  process.env.INTERNAL_CMS_URL || "https://internal.hoopr.ai";

// FE accepts lowercase role strings ("admin", "sales", ...). DB stores uppercase
// (existing UserRoles enum). We only accept the five allowed roles per spec.
const ALLOWED_FE_ROLES = [
  "admin",
  "sales",
  "marketing",
  "music",
  "songfest",
] as const;
type AllowedFeRole = (typeof ALLOWED_FE_ROLES)[number];

const FE_TO_DB_ROLE: Record<AllowedFeRole, UserRoles> = {
  admin: UserRoles.ADMIN,
  sales: UserRoles.SALES,
  marketing: UserRoles.MARKETING,
  music: UserRoles.MUSIC,
  songfest: UserRoles.SONGFEST,
};

const DB_TO_FE_ROLE: Partial<Record<UserRoles, AllowedFeRole>> = {
  [UserRoles.ADMIN]: "admin",
  [UserRoles.SALES]: "sales",
  [UserRoles.MARKETING]: "marketing",
  [UserRoles.MUSIC]: "music",
  [UserRoles.SONGFEST]: "songfest",
};

const isAllowedFeRole = (v: string): v is AllowedFeRole =>
  (ALLOWED_FE_ROLES as readonly string[]).includes(v);

interface ActorContext {
  actorId: number;
  actorSessionId: number;
  ip?: string;
  endpoint: string;
  method: string;
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------
//
// v2: tempPassword is NOT generated for the user. Login is OTP-based; the password column
// gets a random unguessable hash so the NOT NULL constraint is satisfied and the user can
// optionally set a real password later via the existing /user/forgot-password OTP→reset
// chain. The admin never sees a password and never emails one.

export interface CreateInternalUserInput {
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string | null;
  role: AllowedFeRole;
  // CMS items this user may access. Ignored for admin (admin sees everything).
  functionalities?: string[];
}

export interface CreateInternalUserResult {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: AllowedFeRole;
  mobile: string | null;
  functionalities: string[];
  createdAt: Date;
  emailSent: boolean;
}

export const createInternalUserService = async (
  input: CreateInternalUserInput,
  actor: ActorContext
): Promise<CreateInternalUserResult> => {
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const mobile = input.mobile?.trim() || undefined;

  // 409 — case-insensitive uniqueness across platform=INTERNAL (any status).
  const existing = await findInternalUserByEmailCI(email);
  if (existing) {
    throw new AppError(
      "An internal user with that email already exists.",
      409
    );
  }

  // Random unguessable hash for the password column. Never returned, never emailed.
  // The user can choose to set a real password later via /user/forgot-password.
  const placeholderSecret = generateInternalUserPassword();
  let hashedPassword: string;
  try {
    hashedPassword = await bcrypt.hash(placeholderSecret, 10);
  } catch (err) {
    throw new AppError(`Password hashing failed: ${(err as Error).message}`, 502);
  }

  const newUserDetails: UserDetails = {
    email,
    platform: Platform.INTERNAL,
    password: hashedPassword,
    firstName,
    lastName,
    mobile,
    status: UserStatus.ACTIVE,
    createdBy: actor.actorId,
    createdAt: new Date(),
  };

  let savedUser: UserDetails;
  try {
    savedUser = await saveUser(newUserDetails);
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw new AppError(
        "An internal user with that email already exists.",
        409
      );
    }
    throw new AppError(`Failed to create user: ${(err as Error).message}`, 502);
  }

  const dbRole = FE_TO_DB_ROLE[input.role];
  // Admins carry no grant list — access is by role. Everyone else gets exactly
  // what was passed (empty list = no access until an admin grants something).
  const functionalities = input.role === "admin" ? [] : input.functionalities ?? [];
  const userRoleDetails: UserRoleDetails = {
    userId: savedUser.id!,
    role: dbRole,
    status: UserStatus.ACTIVE,
    restrictions: input.role === "admin" ? null : { functionalities },
    createdAt: new Date(),
  };
  try {
    await saveUserRole(userRoleDetails);
  } catch (err) {
    throw new AppError(
      `Failed to assign role: ${(err as Error).message}`,
      502
    );
  }

  // Welcome email points at the OTP login flow. Non-blocking — a failed send doesn't
  // abort the create, the row exists either way.
  const emailSent = await sendInternalUserWelcomeEmail({
    firstName,
    email,
    loginUrl: INTERNAL_CMS_URL,
  });

  recordInternalUserAudit({
    actorId: actor.actorId,
    actorSessionId: actor.actorSessionId,
    action: "create_internal_user",
    targetUserId: savedUser.id!,
    role: dbRole,
    endpoint: actor.endpoint,
    method: actor.method,
    ipAddress: actor.ip,
  });

  return {
    id: savedUser.id!,
    email: savedUser.email,
    firstName,
    lastName,
    role: input.role,
    mobile: mobile ?? null,
    functionalities,
    createdAt: savedUser.createdAt,
    emailSent,
  };
};

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

export interface ListInternalUsersInput {
  page: number;
  limit: number;
  search?: string;
  role?: AllowedFeRole;
}

interface ListedInternalUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: AllowedFeRole | null;
  mobile: string | null;
  functionalities: string[];
  createdAt: Date;
  lastLoginAt: Date | null;
  deactivated: boolean;
}

export interface ListInternalUsersResult {
  users: ListedInternalUser[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

const MAX_LIST_LIMIT = 100;

export const listInternalUsersService = async (
  input: ListInternalUsersInput
): Promise<ListInternalUsersResult> => {
  const page = Math.max(1, Math.floor(input.page));
  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, Math.floor(input.limit)));
  const role = input.role ? FE_TO_DB_ROLE[input.role] : undefined;

  const { rows, count } = await findInternalUsersPaginated({
    page,
    limit,
    search: input.search,
    role,
  });

  const users: ListedInternalUser[] = rows.map((u) => {
    const firstActiveRoleRow = u.userRoles && u.userRoles.length > 0 ? u.userRoles[0] : null;
    const firstActiveRole = firstActiveRoleRow?.role ?? null;
    const feRole = firstActiveRole ? DB_TO_FE_ROLE[firstActiveRole] ?? null : null;
    return {
      id: u.id!,
      email: u.email,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      role: feRole,
      mobile: u.mobile ?? null,
      functionalities: extractFunctionalities(firstActiveRoleRow?.restrictions),
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt ?? null,
      // status=DELETED is the deactivation signal. Admin reactivate flips it back.
      deactivated: u.status === UserStatus.DELETED,
    };
  });

  return {
    users,
    pagination: {
      page,
      limit,
      total: count,
      pages: Math.max(1, Math.ceil(count / limit)),
    },
  };
};

// ---------------------------------------------------------------------------
// DEACTIVATE
// ---------------------------------------------------------------------------
//
// Sets the user's status to DELETED. The existing findActiveUser filter rejects DELETED
// rows on login, so password-based login is automatically blocked. We also kill all
// active sessions so they can't ride out an existing JWT past deactivation.

export interface DeactivateInternalUserResult {
  id: number;
  deactivated: true;
}

export const deactivateInternalUserService = async (
  targetUserId: number,
  actor: ActorContext
): Promise<DeactivateInternalUserResult> => {
  const target = await findInternalUserById(targetUserId);
  if (!target) {
    throw new AppError("Internal user not found.", 404);
  }
  if (target.status === UserStatus.DELETED) {
    throw new AppError("User is already deactivated.", 409);
  }

  // Admin can't deactivate themselves — would lock them out of the CMS mid-session.
  if (target.id === actor.actorId) {
    throw new AppError("You cannot deactivate your own account.", 400);
  }

  const changed = await deactivateInternalUserById(targetUserId);
  if (!changed) {
    // Race with another deactivation, or status was already DELETED.
    throw new AppError("Could not deactivate user.", 502);
  }

  // Revoke any active sessions immediately. Prevents a deactivated user from continuing to
  // act on an existing token until it expires.
  await deactivateAllUserSessions(targetUserId);

  recordInternalUserAudit({
    actorId: actor.actorId,
    actorSessionId: actor.actorSessionId,
    action: "deactivate_internal_user",
    targetUserId,
    endpoint: actor.endpoint,
    method: actor.method,
    ipAddress: actor.ip,
  });

  return { id: targetUserId, deactivated: true };
};

// ---------------------------------------------------------------------------
// REACTIVATE
// ---------------------------------------------------------------------------

export interface ReactivateInternalUserResult {
  id: number;
  deactivated: false;
}

export const reactivateInternalUserService = async (
  targetUserId: number,
  actor: ActorContext
): Promise<ReactivateInternalUserResult> => {
  const target = await findInternalUserById(targetUserId);
  if (!target) {
    throw new AppError("Internal user not found.", 404);
  }
  if (target.status !== UserStatus.DELETED) {
    throw new AppError("User is not currently deactivated.", 409);
  }

  const changed = await reactivateInternalUserById(targetUserId);
  if (!changed) {
    throw new AppError("Could not reactivate user.", 502);
  }

  recordInternalUserAudit({
    actorId: actor.actorId,
    actorSessionId: actor.actorSessionId,
    action: "reactivate_internal_user",
    targetUserId,
    endpoint: actor.endpoint,
    method: actor.method,
    ipAddress: actor.ip,
  });

  return { id: targetUserId, deactivated: false };
};

// ---------------------------------------------------------------------------
// UPDATE FUNCTIONALITIES
// ---------------------------------------------------------------------------
//
// Replaces a non-admin user's functionality grant list wholesale. Admins are
// rejected — they have full access by role and carry no list.

export interface UpdateInternalUserFunctionalitiesResult {
  id: number;
  functionalities: string[];
}

export const updateInternalUserFunctionalitiesService = async (
  targetUserId: number,
  functionalities: string[],
  actor: ActorContext
): Promise<UpdateInternalUserFunctionalitiesResult> => {
  const target = await findInternalUserById(targetUserId);
  if (!target) {
    throw new AppError("Internal user not found.", 404);
  }

  // Functionality ids are not validated against a fixed catalog — whatever the
  // internal-fe grant UI sends is accepted and stored. The FE is the source of
  // truth for the catalog; each CMS endpoint still enforces its own server-side
  // authorization, so an unknown id simply unlocks nothing.
  const dbRole = await findUserRole(targetUserId);
  if (dbRole === UserRoles.ADMIN) {
    throw new AppError(
      "Admins have full access — functionalities can't be assigned to an admin.",
      400
    );
  }

  // Dedupe so the stored list stays clean even if the client repeats an id.
  const unique = Array.from(new Set(functionalities));
  const changed = await updateInternalUserFunctionalities(targetUserId, unique);
  if (!changed) {
    throw new AppError("Could not update functionalities.", 502);
  }

  recordInternalUserAudit({
    actorId: actor.actorId,
    actorSessionId: actor.actorSessionId,
    action: "update_internal_user_functionalities",
    targetUserId,
    endpoint: actor.endpoint,
    method: actor.method,
    ipAddress: actor.ip,
  });

  return { id: targetUserId, functionalities: unique };
};

// ---------------------------------------------------------------------------
// ME — current internal user's live role + functionalities
// ---------------------------------------------------------------------------
//
// Lets a logged-in internal user re-pull their grant list without re-login, so
// an admin's change takes effect on focus / navigation. Any internal role may
// call this (it's about the caller's own access), not just admins.

export interface InternalUserMeResult {
  role: AllowedFeRole | null;
  functionalities: string[];
}

export const getInternalUserMeService = async (
  userId: number
): Promise<InternalUserMeResult> => {
  const { role, functionalities } = await findUserRoleWithRestrictions(userId);
  const feRole = role ? DB_TO_FE_ROLE[role] ?? null : null;
  // Admins carry no list — they get full access by role on the FE.
  return {
    role: feRole,
    functionalities: feRole === "admin" ? [] : functionalities,
  };
};

export { ALLOWED_FE_ROLES, isAllowedFeRole };
export type { AllowedFeRole };

import bcrypt from "bcrypt";
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
  updateInternalUserPassword,
  saveUser,
  saveUserRole,
  type UserDetails,
  type UserRoleDetails,
} from "../../persistence-service/user/modules.export";
import { UniqueConstraintError } from "sequelize";
import { generateInternalUserPassword } from "./password.helper";
import { sendInternalUserCredentialsEmail } from "./email.helper";
import { recordInternalUserAudit } from "./audit.helper";
import { tryAcquireResetRateLimit } from "./rate-limit.helper";

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

export interface CreateInternalUserInput {
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string | null;
  role: AllowedFeRole;
}

export interface CreateInternalUserResult {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: AllowedFeRole;
  mobile: string | null;
  createdAt: Date;
  tempPassword: string;
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

  // Generate, hash, persist. Failures here are treated as 502 per spec — the user record
  // could not be safely created, so the caller should retry.
  const tempPassword = generateInternalUserPassword();
  let hashedPassword: string;
  try {
    hashedPassword = await bcrypt.hash(tempPassword, 10);
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
    status: UserStatus.ACTIVE, // spec: activated=true
    createdBy: actor.actorId,
    createdAt: new Date(),
  };

  let savedUser: UserDetails;
  try {
    savedUser = await saveUser(newUserDetails);
  } catch (err) {
    // A race between two parallel creates with the same email surfaces as a 409.
    if (err instanceof UniqueConstraintError) {
      throw new AppError(
        "An internal user with that email already exists.",
        409
      );
    }
    throw new AppError(`Failed to create user: ${(err as Error).message}`, 502);
  }

  const dbRole = FE_TO_DB_ROLE[input.role];
  const userRoleDetails: UserRoleDetails = {
    userId: savedUser.id!,
    role: dbRole,
    status: UserStatus.ACTIVE,
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

  // Email — non-blocking for the create. Spec: still return 201 with tempPassword
  // even if SMTP transiently fails so the admin can DM the password as a fallback.
  const emailSent = await sendInternalUserCredentialsEmail({
    firstName,
    email,
    tempPassword,
    loginUrl: INTERNAL_CMS_URL,
    isReset: false,
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
    createdAt: savedUser.createdAt,
    tempPassword,
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
    const firstActiveRole = u.userRoles && u.userRoles.length > 0 ? u.userRoles[0].role : null;
    const feRole = firstActiveRole ? DB_TO_FE_ROLE[firstActiveRole] ?? null : null;
    return {
      id: u.id!,
      email: u.email,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      role: feRole,
      mobile: u.mobile ?? null,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt ?? null,
      // v1: DELETED users count as deactivated. v2 may add a dedicated flag — at that
      // point this expression updates without changing the response shape.
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
// RESET PASSWORD
// ---------------------------------------------------------------------------

export interface ResetInternalUserPasswordResult {
  id: number;
  tempPassword: string;
  emailSent: boolean;
  // 0 when allowed; otherwise this many seconds until the next attempt is allowed.
  retryAfterSeconds?: number;
  rateLimited?: boolean;
}

export const resetInternalUserPasswordService = async (
  targetUserId: number,
  actor: ActorContext
): Promise<ResetInternalUserPasswordResult> => {
  const target = await findInternalUserById(targetUserId);
  if (!target) {
    throw new AppError("Internal user not found.", 404);
  }

  // 60s-per-target rate limit. We check rate limit AFTER the existence check so a
  // 404 always beats a 429 — otherwise an attacker could probe for valid IDs by the
  // 429-vs-404 timing. (Existence check is admin-only anyway, but defence in depth.)
  const rl = await tryAcquireResetRateLimit(targetUserId);
  if (!rl.allowed) {
    return {
      id: targetUserId,
      tempPassword: "",
      emailSent: false,
      rateLimited: true,
      retryAfterSeconds: rl.retryAfterSeconds,
    };
  }

  const tempPassword = generateInternalUserPassword();
  let hashedPassword: string;
  try {
    hashedPassword = await bcrypt.hash(tempPassword, 10);
  } catch (err) {
    throw new AppError(`Password hashing failed: ${(err as Error).message}`, 502);
  }

  try {
    await updateInternalUserPassword(targetUserId, hashedPassword);
  } catch (err) {
    throw new AppError(
      `Failed to update password: ${(err as Error).message}`,
      502
    );
  }

  const emailSent = await sendInternalUserCredentialsEmail({
    firstName: target.firstName?.trim() || "there",
    email: target.email,
    tempPassword,
    loginUrl: INTERNAL_CMS_URL,
    isReset: true,
  });

  recordInternalUserAudit({
    actorId: actor.actorId,
    actorSessionId: actor.actorSessionId,
    action: "reset_internal_user_password",
    targetUserId,
    endpoint: actor.endpoint,
    method: actor.method,
    ipAddress: actor.ip,
  });

  return {
    id: targetUserId,
    tempPassword,
    emailSent,
  };
};

export { ALLOWED_FE_ROLES, isAllowedFeRole };
export type { AllowedFeRole };

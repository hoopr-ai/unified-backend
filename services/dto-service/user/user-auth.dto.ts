import type { Platform } from "../constants/modules.export";
import type { ProfileRole, UserRoles, UserStatus } from "./user.enum";

export interface CreateAuthRequestData {
    email: string;
    password: string;
    platform: Platform;
    brandId?: number;
}

export interface InviteUserAuthRequestData {
    email: string;
}

export interface CompleteProfileRequestData {
    firstName: string;
    lastName: string;
    mobile: string;
    profileRole: ProfileRole;
}

export interface UpdateProfileRequestData {
    firstName?: string;
    lastName?: string;
    mobile?: string;
    profileRole?: ProfileRole;
}

export interface UserProfileResponse {
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
    mobile?: string;
    profileRole?: string;
    role?: UserRoles;
    isProfileComplete: boolean;
    status: UserStatus;
}

export interface LoginUserRequestData {
  email: string;
  password: string;
  platform: Platform;
}

export interface ResetPasswordRequestData {
  email: string;
  oldPassword: string;
  newPassword: string;
  platform: Platform;
}

export interface LoginResponse {
  id: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string | null;
  isProfileComplete: boolean;
  expiresIn: number;
  token: string;
  brandId?: number;
  brandName?: string;
}

export const AccessTokenExpiry = "24h";
export const AccessTokenExpiryInSeconds = 24 * 60 * 60;

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
}

export interface CreateSessionData {
  userId: number;
  sessionToken: string;
  metadata: SessionMetadata;
}

export interface ActivityLogData {
  userId: number;
  sessionId: number;
  action: string;
  endpoint: string;
  method: string;
  statusCode?: number;
  metadata?: SessionMetadata;
  requestBody?: Record<string, unknown>;
  responseTime?: number;
}
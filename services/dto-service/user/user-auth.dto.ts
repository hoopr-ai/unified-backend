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
  countryCode: string;
  profileRole: ProfileRole;
  // Brand-level fields. Only honoured when the user has no brand yet (the
  // person creating it); for an invited user they are ignored and the brand's
  // own values are inherited instead. See GET /users/complete-profile-context.
  brandName?: string;
  instagramLink?: string;
  youtubeLink?: string;
  facebookLink?: string;
}

// Everything the FE needs to render the complete-profile form: whether the
// brand block should be asked for at all, and what to prefill it with.
export interface CompleteProfileContextResponse {
  hasBrand: boolean;
  brandId?: number;
  brandName?: string;
  instagramLink?: string | null;
  youtubeLink?: string | null;
  facebookLink?: string | null;
  // false => render the brand block read-only; the API will ignore any edits.
  canEditBrand: boolean;
  requiresBrandDetails: boolean;
}

export interface UpdateProfileRequestData {
  firstName?: string;
  lastName?: string;
  mobile?: string;
  countryCode?: string;
  profileRole?: ProfileRole;
  instagramLink?: string | null;
  youtubeLink?: string | null;
  facebookLink?: string | null;
  brandName?: string;
}

export interface UserProfileResponse {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  countryCode?: string;
  profileRole?: string;
  role?: UserRoles;
  isProfileComplete: boolean;
  status: UserStatus;
  instagramLink?: string | null;
  youtubeLink?: string | null;
  facebookLink?: string | null;
  brandId?: number;
  brandName?: string;
  canEditBrand?: boolean;
}

export interface LoginUserRequestData {
  email: string;
  password: string;
  platform: Platform;
}

export interface ResetPasswordRequestData {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
  platform: Platform;
}

// Legacy interface for reference (deprecated)
export interface LegacyResetPasswordRequestData {
  email: string;
  newPassword: string;
  confirmPassword: string;
  platform: Platform;
}

export interface VerifyOtpResponse {
  resetToken: string;
}

export interface LoginResponse {
  id: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  mobile?: string | null;
  countryCode?: string | null;
  role: string | null;
  // INTERNAL CMS functionality grant list. Empty for non-internal logins and
  // for admins (admins are gated by role, not by this list).
  functionalities?: string[];
  isProfileComplete: boolean;
  expiresIn: number;
  token: string;
  refreshToken: string;
  brandId?: number;
  brandName?: string;
}

export const AccessTokenExpiry = "3h";
export const AccessTokenExpiryInSeconds = 3 * 60 * 60;

export const RefreshTokenExpiry = "30d";
export const RefreshTokenExpiryInSeconds = 30 * 24 * 60 * 60;

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

export interface SendEmailOtpRequestData {
  email: string;
  platform: Platform;
}

export interface VerifyEmailOtpRequestData {
  email: string;
  otp: string;
  platform: Platform;
}

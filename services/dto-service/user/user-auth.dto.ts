import type { Platform } from "../constants/modules.export";

export interface CreateAuthRequestData {
    email: string;
    firstName: string;
    lastName: string;
    mobile: string;
    password: string;
    platform: Platform;
    organizationId?: number;
    brandId?: number;
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
  role: string | null;
  updatedAt: number | undefined;
  expiresIn: number;
  token: string;
}

export const AccessTokenExpiry = "3h";
export const AccessTokenExpiryInSeconds = 3 * 60 * 60;

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
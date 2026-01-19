import type { Platform } from "../constants/modules.export";

export interface CreateAuthRequestData {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    platform: Platform;
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
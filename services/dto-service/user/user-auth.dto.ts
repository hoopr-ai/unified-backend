import type { Platform } from "../constants/modules.export";

export interface LoginUserRequestData {
    email: string;
    password: string;
    platform: Platform;
}

export interface LoginUserRequestData {
    email: string;
    password: string;
    platform: Platform;
}


export interface UserRow {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  password: string;
  welcome_email_sent?: boolean;
}

export interface LoginResponse {
  token: string;
  userData: {
    id: number;
    email: string;
    firstName: string | undefined;
    lastName: string | undefined;
    createdAt: string;
    updatedAt: string;
    expiresIn: number;
  };
}

export const AccessTokenExpiry = '3h';
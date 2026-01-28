import type { Response } from "express";

interface SendResponseOptions {
  status?: number;
  data?: unknown;
  code?: number;
  message: string;
}

/**
 * Send a standardized JSON response
 */
export const sendResponse = (
  res: Response,
  { status = 200, data = {}, code = 0, message }: SendResponseOptions
): void => {
  res.status(status).json({
    data,
    error: { code, message },
  });
};

/**
 * Send a success response (status: 200, code: 0)
 */
export const sendSuccess = (
  res: Response,
  data: unknown,
  message: string
): void => {
  sendResponse(res, { status: 200, data, code: 0, message });
};

/**
 * Send an error response (code: 1)
 */
export const sendError = (
  res: Response,
  status: number,
  message: string,
  data: unknown = null
): void => {
  sendResponse(res, { status, data, code: 1, message });
};

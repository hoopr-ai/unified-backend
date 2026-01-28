import type { Response } from "express";
import { HttpStatusCode } from "../dto-service/constants/modules.export";

interface SendResponseOptions {
  status?: HttpStatusCode;
  data?: unknown;
  code?: number;
  message: string;
}

/**
 * Send a standardized JSON response
 */
export const sendResponse = (
  res: Response,
  { status = HttpStatusCode.OK, data = {}, code = 0, message }: SendResponseOptions
): void => {
  res.status(status).json({
    data,
    error: { code, message },
  });
};

/**
 * Send an error response (code: 1)
 */
export const sendError = (
  res: Response,
  status: HttpStatusCode,
  message: string,
  data: unknown = null
): void => {
  sendResponse(res, { status, data, code: 1, message });
};

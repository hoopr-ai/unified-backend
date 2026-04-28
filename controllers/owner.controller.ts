import type { Request, Response } from "express";
import {
  getAllOwnersService,
  searchOwnersService,
} from "../services/business-service/owner/owner.service";
import { catchAsync, sendError, sendResponse } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode } from "../services/dto-service/modules.export";

export const getAllOwners = catchAsync(async (req: Request, res: Response) => {
  const response = await getAllOwnersService(
    req.query.page as string,
    req.query.limit as string,
  );
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.GetOwnersSuccess,
  });
});

export const searchOwners = catchAsync(async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query || query.trim().length < 1) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Search query 'q' is required");
  }
  const results = await searchOwnersService(query, req.query.limit as string);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: { owners: results },
    message: ResponseMessages.GetOwnersSuccess,
  });
});

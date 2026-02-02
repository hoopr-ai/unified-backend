import type { Request, Response } from "express";
import { createLicenseTypeService } from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const createLicenseType = catchAsync(async (req: AuthRequest, res: Response) => {
  const response = await createLicenseTypeService(req.body);
  sendResponse(res, {
    status: HttpStatusCode.CREATED,
    data: response,
    message: "License type created successfully",
  });
});

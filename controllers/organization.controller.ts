import type { Request, Response } from "express";
import { catchAsync } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import {
  createOrganizationService,
  createBrandService,
} from "../services/business-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const createOrganization = catchAsync(async (req: AuthRequest, res: Response) => {
  const createdBy = req.session?.userId;
  const response = await createOrganizationService(req.body, createdBy);
  res.status(201).json({
    data: response,
    error: { code: 0, message: ResponseMessages.OrganizationCreatedSuccess },
  });
});

export const createBrand = catchAsync(async (req: AuthRequest, res: Response) => {
  const createdBy = req.session?.userId;
  const response = await createBrandService(req.body, createdBy);
  res.status(201).json({
    data: response,
    error: { code: 0, message: ResponseMessages.BrandCreatedSuccess },
  });
});

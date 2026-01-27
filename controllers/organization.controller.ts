import type { Request, Response } from "express";
import { catchAsync } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import {
  createOrganizationService,
  createBrandService,
} from "../services/business-service/modules.export";

export const createOrganization = catchAsync(async (req: Request, res: Response) => {
  const response = await createOrganizationService(req.body);
  res.status(201).json({
    data: response,
    error: { code: 0, message: ResponseMessages.OrganizationCreatedSuccess },
  });
});

export const createBrand = catchAsync(async (req: Request, res: Response) => {
  const response = await createBrandService(req.body);
  res.status(201).json({
    data: response,
    error: { code: 0, message: ResponseMessages.BrandCreatedSuccess },
  });
});

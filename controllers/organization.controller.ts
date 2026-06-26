import type { Request, Response } from "express";
import { catchAsync, sendResponse } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import {
  createOrganizationService,
  createBrandService,
  listOrganizationsService,
  updateOrganizationService,
  listBrandsByOrganizationService,
  getBrandDetailService,
  updateBrandService,
  listUsersByBrandService,
  listTrackTiersService,
} from "../services/business-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const createOrganization = catchAsync(async (req: AuthRequest, res: Response) => {
  const createdBy = req.session?.userId;
  const response = await createOrganizationService(req.body, createdBy);
  sendResponse(res, { status: HttpStatusCode.CREATED, data: response, message: ResponseMessages.OrganizationCreatedSuccess });
});

export const createBrand = catchAsync(async (req: AuthRequest, res: Response) => {
  const createdBy = req.session?.userId;
  const response = await createBrandService(req.body, createdBy);
  sendResponse(res, { status: HttpStatusCode.CREATED, data: response, message: ResponseMessages.BrandCreatedSuccess });
});

export const listOrganizations = catchAsync(async (req: Request, res: Response) => {
  const response = await listOrganizationsService(
    req.query.page as string,
    req.query.limit as string,
    req.query.search as string,
  );
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetOrganizationsSuccess });
});

export const updateOrganization = catchAsync(async (req: Request, res: Response) => {
  const response = await updateOrganizationService(Number(req.params.organizationId), req.body);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.OrganizationUpdatedSuccess });
});

export const listBrandsByOrganization = catchAsync(async (req: Request, res: Response) => {
  const response = await listBrandsByOrganizationService(Number(req.params.organizationId));
  sendResponse(res, { status: HttpStatusCode.OK, data: { brands: response }, message: ResponseMessages.GetBrandsSuccess });
});

export const getBrandDetail = catchAsync(async (req: Request, res: Response) => {
  const response = await getBrandDetailService(Number(req.params.brandId));
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetBrandSuccess });
});

export const updateBrand = catchAsync(async (req: Request, res: Response) => {
  const response = await updateBrandService(Number(req.params.brandId), req.body);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.BrandUpdatedSuccess });
});

export const listUsersByBrand = catchAsync(async (req: Request, res: Response) => {
  const response = await listUsersByBrandService(
    Number(req.params.brandId),
    req.query.page as string,
    req.query.limit as string,
  );
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetUsersSuccess });
});

export const listTrackTiers = catchAsync(async (_req: Request, res: Response) => {
  const tiers = await listTrackTiersService();
  sendResponse(res, { status: HttpStatusCode.OK, data: { tiers }, message: ResponseMessages.GetTrackTiersSuccess });
});

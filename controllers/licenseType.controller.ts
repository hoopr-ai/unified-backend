import type { Request, Response } from "express";
import {
  createLicenseTypeService,
  getLicenseTypeByIdService,
  getAllLicenseTypesService,
  updateLicenseTypeService,
  deleteLicenseTypeService,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
  sendError,
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

export const getLicenseTypeById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "License type ID is required", {});
  }

  const response = await getLicenseTypeByIdService(id);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "License type retrieved successfully",
  });
});

export const getAllLicenseTypes = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const includeDiscontinued = req.query.includeDiscontinued === "true";

  const response = await getAllLicenseTypesService(page, limit, includeDiscontinued);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "License types retrieved successfully",
  });
});

export const updateLicenseType = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "License type ID is required", {});
  }

  const response = await updateLicenseTypeService(id, req.body);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "License type updated successfully",
  });
});

export const deleteLicenseType = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "License type ID is required", {});
  }

  const response = await deleteLicenseTypeService(id);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "License type deleted successfully",
  });
});

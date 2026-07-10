import type { Request, Response } from "express";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  listOwnersForAdminService,
  getOwnerForAdminService,
  updateOwnerUsageInfoService,
} from "../services/business-service/admin-owner/modules.export";
import { listOwnersQuerySchema } from "../middlewares/admin-owner.validation";

// GET /admin/owners — paginated owner list (+ ?search) for the usage-info CMS.
export const listOwners = catchAsync(async (req: Request, res: Response) => {
  const { value, error } = listOwnersQuerySchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    throw new AppError(error.details.map((d) => d.message).join(", "), 400);
  }

  const result = await listOwnersForAdminService({
    page: value.page,
    limit: value.limit,
    search: value.search,
  });

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: "Owners fetched.",
  });
});

// GET /admin/owners/:id — single owner with its full usageInfo blob.
export const getOwner = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new AppError("Invalid owner id.", 400);
  }

  const owner = await getOwnerForAdminService(id);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: owner,
    message: "Owner fetched.",
  });
});

// PUT /admin/owners/:id/usage-info — overwrite the owner's usageInfo blob.
export const updateOwnerUsageInfo = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id || typeof id !== "string") {
      throw new AppError("Invalid owner id.", 400);
    }

    const owner = await updateOwnerUsageInfoService(id, req.body);

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: owner,
      message: "Usage info updated.",
    });
  },
);

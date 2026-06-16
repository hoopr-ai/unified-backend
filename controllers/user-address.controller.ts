import type { Response } from "express";
import {
  getAddressesService,
  upsertBusinessAddressService,
  upsertBillingAddressService,
  deleteAddressService,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode, AddressType } from "../services/dto-service/modules.export";
import type { Request } from "express";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const getAddresses = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const data = await getAddressesService(userId);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Addresses fetched successfully" });
});

export const upsertBusinessAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const data = await upsertBusinessAddressService(userId, req.body);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Business address saved successfully" });
});

export const upsertBillingAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const data = await upsertBillingAddressService(userId, req.body);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Billing address saved successfully" });
});

export const deleteAddress = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const { type } = req.params;
  if (type !== AddressType.BUSINESS && type !== AddressType.BILLING) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid address type. Use BUSINESS or BILLING", {});
  }

  await deleteAddressService(userId, type as AddressType);
  sendResponse(res, { status: HttpStatusCode.OK, data: {}, message: "Address deleted successfully" });
});

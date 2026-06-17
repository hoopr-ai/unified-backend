import type { Response, Request } from "express";
import {
  catchAsync,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import { CartType } from "../services/persistence-service/cart/schemas/cart.schema";
import {
  getCartService,
  addToCartService,
  updateCartService,
} from "../services/business-service/cart/cart.service";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const getCart = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const cartType = req.query.cartType as CartType | undefined;
  if (cartType && !Object.values(CartType).includes(cartType)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid cartType. Use C or B", {});
  }

  const data = await getCartService(userId, cartType);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Cart fetched successfully" });
});

export const addToCart = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const data = await addToCartService(userId, req.body);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Item added to cart" });
});

export const updateCart = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const data = await updateCartService(userId, req.body);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Cart updated successfully" });
});

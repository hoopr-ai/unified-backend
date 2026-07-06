import type { Request, Response } from "express";
import type Joi from "joi";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  overviewQuerySchema,
  signupsSummaryQuerySchema,
  signupsListQuerySchema,
  cartsSummaryQuerySchema,
  cartsListQuerySchema,
  ordersListQuerySchema,
  transactionsSummaryQuerySchema,
  transactionsListQuerySchema,
  funnelQuerySchema,
  funnelDroppedQuerySchema,
  topTracksQuerySchema,
  customersSummaryQuerySchema,
  customersListQuerySchema,
} from "../middlewares/admin-pay-per-track.validation";
import {
  getOverviewService,
  getSignupsSummaryService,
  listSignupsService,
  getCartsSummaryService,
  listCartsService,
  listOrdersService,
  getOrderDetailService,
  getTransactionsSummaryService,
  listTransactionsService,
  getFunnelService,
  listFunnelDroppedService,
  getTopTracksService,
  getCustomersSummaryService,
  listCustomersService,
} from "../services/business-service/pay-per-track/modules.export";

// All endpoints are GETs, so validation happens here on req.query (the same
// pattern admin-sku.controller uses) rather than via validateRequest.
const validateQuery = <T>(schema: Joi.ObjectSchema, query: unknown): T => {
  const { value, error } = schema.validate(query, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    throw new AppError(error.details.map((d) => d.message).join(", "), 400);
  }
  return value as T;
};

const ok = (res: Response, data: unknown, message: string) =>
  sendResponse(res, { status: HttpStatusCode.OK, data, message });

// GET /admin/pay-per-track/overview
export const getOverview = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<{ startDate: string; endDate: string }>(
    overviewQuerySchema,
    req.query,
  );
  ok(res, await getOverviewService(value), "Pay-per-track overview fetched.");
});

// GET /admin/pay-per-track/signups/summary
export const getSignupsSummary = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<{ startDate: string; endDate: string }>(
      signupsSummaryQuerySchema,
      req.query,
    );
    ok(res, await getSignupsSummaryService(value), "Signup summary fetched.");
  },
);

// GET /admin/pay-per-track/signups
export const listSignups = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Parameters<typeof listSignupsService>[0]>(
    signupsListQuerySchema,
    req.query,
  );
  ok(res, await listSignupsService(value), "Signups fetched.");
});

// GET /admin/pay-per-track/carts/summary
export const getCartsSummary = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<{ startDate: string; endDate: string }>(
      cartsSummaryQuerySchema,
      req.query,
    );
    ok(res, await getCartsSummaryService(value), "Cart summary fetched.");
  },
);

// GET /admin/pay-per-track/carts
export const listCarts = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Parameters<typeof listCartsService>[0]>(
    cartsListQuerySchema,
    req.query,
  );
  ok(res, await listCartsService(value), "Cart items fetched.");
});

// GET /admin/pay-per-track/orders
export const listOrders = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Parameters<typeof listOrdersService>[0]>(
    ordersListQuerySchema,
    req.query,
  );
  ok(res, await listOrdersService(value), "Orders fetched.");
});

// GET /admin/pay-per-track/orders/:id
export const getOrderDetail = catchAsync(
  async (req: Request, res: Response) => {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new AppError("Invalid order id.", 400);
    }
    const order = await getOrderDetailService(orderId);
    if (!order) {
      throw new AppError("Order not found.", 404);
    }
    ok(res, order, "Order fetched.");
  },
);

// GET /admin/pay-per-track/transactions/summary
export const getTransactionsSummary = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<{ startDate: string; endDate: string }>(
      transactionsSummaryQuerySchema,
      req.query,
    );
    ok(
      res,
      await getTransactionsSummaryService(value),
      "Transaction summary fetched.",
    );
  },
);

// GET /admin/pay-per-track/transactions
export const listTransactions = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<Parameters<typeof listTransactionsService>[0]>(
      transactionsListQuerySchema,
      req.query,
    );
    ok(res, await listTransactionsService(value), "Transactions fetched.");
  },
);

// GET /admin/pay-per-track/funnel
export const getFunnel = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<{ startDate: string; endDate: string }>(
    funnelQuerySchema,
    req.query,
  );
  ok(res, await getFunnelService(value), "Funnel fetched.");
});

// GET /admin/pay-per-track/funnel/dropped
export const listFunnelDropped = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<Parameters<typeof listFunnelDroppedService>[0]>(
      funnelDroppedQuerySchema,
      req.query,
    );
    ok(res, await listFunnelDroppedService(value), "Dropped users fetched.");
  },
);

// GET /admin/pay-per-track/tracks/top
export const getTopTracks = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Parameters<typeof getTopTracksService>[0]>(
    topTracksQuerySchema,
    req.query,
  );
  ok(res, await getTopTracksService(value), "Top tracks fetched.");
});

// GET /admin/pay-per-track/customers/summary
export const getCustomersSummary = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<{ startDate: string; endDate: string }>(
      customersSummaryQuerySchema,
      req.query,
    );
    ok(
      res,
      await getCustomersSummaryService(value),
      "Customer summary fetched.",
    );
  },
);

// GET /admin/pay-per-track/customers
export const listCustomers = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Parameters<typeof listCustomersService>[0]>(
    customersListQuerySchema,
    req.query,
  );
  ok(res, await listCustomersService(value), "Customers fetched.");
});

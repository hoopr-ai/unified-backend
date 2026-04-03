import type { Request, Response } from "express";
import { catchAsync, sendResponse } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import {
  getFaqsService,
  createFaqService,
  updateFaqService,
  deleteFaqService,
} from "../services/business-service/faq/faq.service";
import { getFaqsQuerySchema } from "../middlewares/faq.validation";
import { AppError } from "../services/helper-service/modules.export";

export const getFaqs = catchAsync(async (req: Request, res: Response) => {
  const { error, value } = getFaqsQuerySchema.validate(req.query, { abortEarly: false, stripUnknown: true });
  if (error) throw new AppError(error.details.map(d => d.message).join(", "), 400);
  const response = await getFaqsService(value);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetFaqsSuccess });
});

export const createFaq = catchAsync(async (req: Request, res: Response) => {
  const response = await createFaqService(req.body);
  sendResponse(res, { status: HttpStatusCode.CREATED, data: response, message: ResponseMessages.FaqCreatedSuccess });
});

export const updateFaq = catchAsync(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const response = await updateFaqService(id, req.body);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.FaqUpdatedSuccess });
});

export const deleteFaq = catchAsync(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await deleteFaqService(id);
  sendResponse(res, { status: HttpStatusCode.OK, data: null, message: ResponseMessages.FaqDeletedSuccess });
});

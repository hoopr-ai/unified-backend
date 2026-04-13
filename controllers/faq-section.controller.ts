import type { Request, Response } from "express";
import { catchAsync, sendResponse } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import {
  getFaqSectionsService,
  createFaqSectionService,
  updateFaqSectionService,
  deleteFaqSectionService,
  reorderFaqSectionsService,
} from "../services/business-service/faq/faq-section.service";
import { getFaqSectionsQuerySchema } from "../middlewares/faq-section.validation";
import { AppError } from "../services/helper-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const getFaqSections = catchAsync(async (req: Request, res: Response) => {
  const { error, value } = getFaqSectionsQuerySchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) throw new AppError(error.details.map((d) => d.message).join(", "), 400);
  const response = await getFaqSectionsService(value);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.GetFaqSectionsSuccess,
  });
});

export const createFaqSection = catchAsync(async (req: Request, res: Response) => {
  const response = await createFaqSectionService(req.body);
  sendResponse(res, {
    status: HttpStatusCode.CREATED,
    data: response,
    message: ResponseMessages.FaqSectionCreatedSuccess,
  });
});

export const updateFaqSection = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const userId = req.session?.userId;
  const response = await updateFaqSectionService(id, req.body, userId);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.FaqSectionUpdatedSuccess,
  });
});

export const deleteFaqSection = catchAsync(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await deleteFaqSectionService(id);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: null,
    message: ResponseMessages.FaqSectionDeletedSuccess,
  });
});

export const reorderFaqSections = catchAsync(async (req: Request, res: Response) => {
  const response = await reorderFaqSectionsService(req.body);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.FaqSectionsReorderedSuccess,
  });
});

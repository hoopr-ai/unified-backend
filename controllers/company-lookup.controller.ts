import type { Request, Response } from "express";
import { lookupCompanyService } from "../services/business-service/company-lookup/company-lookup.service";
import {
  catchAsync,
  sendResponse,
} from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const lookupCompany = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { companyName } = req.body;

    const response = await lookupCompanyService(companyName);

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.CompanyLookupSuccess,
    });
  }
);

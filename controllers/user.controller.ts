import type { Request, Response } from "express";
import {
  loginService,
} from "../services/business-service/modules.export";
import { catchAsync, AppError } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";

export const login = catchAsync(async (req: Request, res: Response) => {
  const response = await loginService(req.body);
  res.status(200).json({
    data: response,
    error: { code: 0, message: ResponseMessages.LoginSuccess },
  });
});

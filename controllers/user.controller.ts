import type { Request, Response } from "express";
import {
  loginService,
} from "../services/business-service/modules.export";

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const response = await loginService(req.body);

    res.status(200).json({
      data: response,
      error: { code: 0, message: "" },
    });
  } catch (error: any) {
    console.error("Error in Login:", error.message || error);

    const statusCode = error.statusCode || 500;

    res.status(statusCode).json({
      data: {},
      error: {
        code: 1,
        message: error.message || "Internal server error",
      },
    });
  }
  return
};

import type { Request, Response, NextFunction } from "express";
import { AppError } from "../services/helper-service/AppError";

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {

  console.error("Error:", err);

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err instanceof AppError ? err.message : "Internal server error";

  res.status(statusCode).json({
    data: {},
    error: {
      code: 1,
      message,
    },
  });
};

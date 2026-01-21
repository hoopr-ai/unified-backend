import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { AppError } from "../services/helper-service/AppError";
interface AuthRequest extends Request {
  session?: string | JwtPayload;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    if (!token) {
      throw new AppError("The JWT token provided is invalid.", 401);
    }
    jwt.verify(
      token,
      process.env.JWT_SECRET_KEY as string,
      (err, decoded) => {
        if (err || !decoded) {
          throw new AppError("The JWT token provided is invalid.", 401);
        }
        req.session = decoded;
        next();
      }
    );
  } catch (error) {
    throw new AppError("The JWT token provided is invalid.", 401);
  }
};


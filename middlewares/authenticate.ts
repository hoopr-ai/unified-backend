import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { AppError } from "../services/helper-service/AppError";
import { validateAndRefreshSession } from "../services/business-service/user/user.service";
import { extractSessionMetadata } from "../services/helper-service/session.helper";

export interface SessionPayload extends JwtPayload {
  userId: number;
  email: string;
  platform: string;
  role: string | null;
  sessionId?: number;
}

interface AuthRequest extends Request {
  session?: SessionPayload;
  sessionToken?: string;
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
        req.session = decoded as SessionPayload;
        req.sessionToken = token;
        next();
      }
    );
  } catch (error) {
    throw new AppError("The JWT token provided is invalid.", 401);
  }
};

/**
 * Enhanced authenticate middleware that validates session and handles 30-min inactivity
 * If session expired due to inactivity, it returns 401 with a specific message
 */
export const authenticateWithSession = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      throw new AppError("The JWT token provided is invalid.", 401);
    }

    // Verify JWT token first
    let decoded: SessionPayload;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET_KEY as string) as SessionPayload;
    } catch {
      throw new AppError("The JWT token provided is invalid.", 401);
    }

    // Validate session and check for inactivity
    const { isValid, session, needsNewSession } = await validateAndRefreshSession(token);

    if (!isValid) {
      if (needsNewSession) {
        throw new AppError(
          "Session expired due to inactivity. Please login again.",
          401
        );
      }
      throw new AppError("Invalid session. Please login again.", 401);
    }

    // Attach session info to request
    req.session = {
      ...decoded,
      sessionId: session?.id,
    };
    req.sessionToken = token;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Authentication failed.", 401);
  }
};


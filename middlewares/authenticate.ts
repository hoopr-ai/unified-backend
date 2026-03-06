import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { AppError } from "../services/helper-service/AppError";
import { validateAndRefreshSession } from "../services/business-service/user/user.service";
import { extractSessionMetadata } from "../services/helper-service/session.helper";
import { Platform } from "../services/dto-service/modules.export";

export interface SessionPayload extends JwtPayload {
  userId: number;
  email: string;
  platform: Platform;
  role: string | null;
  sessionId?: number;
}

interface AuthRequest extends Request {
  session?: SessionPayload;
  sessionToken?: string;
  sessionIdFromCookie?: number;
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

export interface AuthOptions {
  platforms?: string[];
  roles?: string[];
}

type AuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;

/**
 * Enhanced authenticate middleware that validates session and handles 30-min inactivity
 * If session expired due to inactivity, it returns 401 with a specific message
 *
 * Can be used in two ways:
 * 1. Without options: authenticateWithSession (backward compatible)
 * 2. With options: authenticateWithSession({ platforms: ['web'], roles: ['admin'] })
 */
export function authenticateWithSession(options: AuthOptions): AuthMiddleware;
export function authenticateWithSession(req: Request, res: Response, next: NextFunction): Promise<void>;
export function authenticateWithSession(
  optionsOrReq?: AuthOptions | Request,
  resOrUndefined?: Response,
  nextOrUndefined?: NextFunction
): AuthMiddleware | Promise<void> {
  // Check if called directly as middleware (backward compatible)
  if (optionsOrReq && resOrUndefined && nextOrUndefined) {
    return handleAuthentication()(
      optionsOrReq as AuthRequest,
      resOrUndefined,
      nextOrUndefined
    );
  }

  // Called with options - return middleware function
  const options = (optionsOrReq as AuthOptions) || {};
  return handleAuthentication(options);
}

const handleAuthentication = (options: AuthOptions = {}) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
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

      // Validate platform if specified
      if (options.platforms && options.platforms.length > 0) {
        if (!decoded.platform || !options.platforms.includes(decoded.platform)) {
          throw new AppError(
            `Access denied. This API is not available for platform: ${decoded.platform || 'unknown'}`,
            403
          );
        }
      }

      // Validate role if specified
      if (options.roles && options.roles.length > 0) {
        if (!decoded.role || !options.roles.includes(decoded.role)) {
          throw new AppError(
            `Access denied. Required role: ${options.roles.join(' or ')}`,
            403
          );
        }
      }

      // Extract metadata for potential session recreation
      const metadata = extractSessionMetadata(req);

      // Validate session and check for inactivity
      // If inactive, a new session will be created automatically (user stays logged in until token expires)
      const { isValid, session, needsNewSession } = await validateAndRefreshSession(
        token,
        decoded,
        metadata
      );

      if (!isValid) {
        if (needsNewSession) {
          throw new AppError(
            "Session expired. Please login again.",
            401
          );
        }
        throw new AppError("Invalid session. Please login again.", 401);
      }

      // Get sessionId from cookie
      const sessionIdFromCookie = req.cookies?.sessionId
        ? parseInt(req.cookies.sessionId, 10)
        : undefined;

      // Attach session info to request
      req.session = {
        ...decoded,
        sessionId: session?.id,
      };
      req.sessionToken = token;
      req.sessionIdFromCookie = sessionIdFromCookie;

      next();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("Authentication failed.", 401);
    }
  };
};


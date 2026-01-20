import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
interface AuthRequest extends Request {
  session?: string | JwtPayload;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        data: {},
        error: { code: 1, message: "Sign in required to access this resource." },
      });
    }

    jwt.verify(
      token,
      process.env.JWT_SECRET_KEY as string,
      (err, decoded) => {
        if (err || !decoded) {
          return res.status(401).json({
            data: {},
            error: { code: 1, message: "The JWT token provided is invalid." },
          });
        }

        req.session = decoded;
        next();
      }
    );
  } catch (error) {
    res.status(500).json({
      data: {},
      error: { code: 1, message: "Authentication error occurred." },
    });
  }
};


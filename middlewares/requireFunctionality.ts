import type { Request, Response, NextFunction } from "express";
import { AppError } from "../services/helper-service/AppError";
import { UserRoles } from "../services/dto-service/modules.export";
import { findUserRoleWithRestrictions } from "../services/persistence-service/user/user.persistence.service";
import type { SessionPayload } from "./authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

/**
 * Gate an INTERNAL route by a granted functionality (the same ids used by the
 * internal-fe home cards + FunctionalityRoute, see
 * admin-internal-users/functionalities.ts).
 *
 * MUST run AFTER authenticateWithSession({ platforms: [INTERNAL] }) — it reads
 * req.session for the caller's userId + role.
 *
 *   ADMIN role        → always allowed (admins have everything by role).
 *   other internal    → allowed only if the live grant list (from the DB, not
 *                       the JWT) contains the functionality.
 *
 * Reading the grant live means an admin revoking access takes effect on the
 * next request without forcing the user to re-login.
 */
export const requireFunctionality = (functionality: string) => {
  return async (
    req: AuthRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const session = req.session;
    if (!session?.userId) {
      throw new AppError("Unauthorized", 401);
    }

    // Admins bypass the grant check entirely.
    if (session.role === UserRoles.ADMIN) {
      return next();
    }

    const { functionalities } = await findUserRoleWithRestrictions(
      session.userId,
    );

    if (!functionalities.includes(functionality)) {
      throw new AppError(
        `Access denied. Missing functionality: ${functionality}`,
        403,
      );
    }

    next();
  };
};

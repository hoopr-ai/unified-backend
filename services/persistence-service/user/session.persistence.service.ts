import { Op } from "sequelize";
import { SessionStatus, SESSION_TIMEOUT_MINUTES } from "../../dto-service/modules.export";
import {
  UserSessionModel,
  UserSessionDetails,
} from "./schemas/modules.export";

export const createSession = async (
  sessionDetails: UserSessionDetails
): Promise<UserSessionDetails> => {
  const session = await UserSessionModel.create(sessionDetails);
  return session;
};

export const findActiveSessionByToken = async (
  sessionToken: string
): Promise<UserSessionDetails | null> => {
  const session = await UserSessionModel.findOne({
    where: {
      sessionToken,
      status: SessionStatus.ACTIVE,
    },
  });
  return session;
};

export const findActiveSessionByUserId = async (
  userId: number
): Promise<UserSessionDetails | null> => {
  const session = await UserSessionModel.findOne({
    where: {
      userId,
      status: SessionStatus.ACTIVE,
    },
    order: [["lastActivityAt", "DESC"]],
  });
  return session;
};

export const updateSessionLastActivity = async (
  sessionId: number
): Promise<void> => {
  await UserSessionModel.update(
    {
      lastActivityAt: new Date(),
    },
    {
      where: { id: sessionId },
    }
  );
};

export const deactivateSession = async (
  sessionId: number
): Promise<void> => {
  await UserSessionModel.update(
    {
      status: SessionStatus.INACTIVE,
    },
    {
      where: { id: sessionId },
    }
  );
};

export const deactivateSessionByToken = async (
  sessionToken: string
): Promise<void> => {
  await UserSessionModel.update(
    {
      status: SessionStatus.INACTIVE,
    },
    {
      where: { sessionToken },
    }
  );
};

export const deactivateAllUserSessions = async (
  userId: number
): Promise<void> => {
  await UserSessionModel.update(
    {
      status: SessionStatus.INACTIVE,
    },
    {
      where: {
        userId,
        status: SessionStatus.ACTIVE,
      },
    }
  );
};

export const expireInactiveSessions = async (): Promise<number> => {
  const timeoutThreshold = new Date(
    Date.now() - SESSION_TIMEOUT_MINUTES * 60 * 1000
  );

  const [affectedCount] = await UserSessionModel.update(
    {
      status: SessionStatus.EXPIRED,
    },
    {
      where: {
        status: SessionStatus.ACTIVE,
        lastActivityAt: {
          [Op.lt]: timeoutThreshold,
        },
      },
    }
  );

  return affectedCount;
};

export const isSessionExpiredByInactivity = async (
  sessionId: number
): Promise<boolean> => {
  const session = await UserSessionModel.findOne({
    where: { id: sessionId },
  });

  if (!session) {
    return true;
  }

  const timeoutThreshold = new Date(
    Date.now() - SESSION_TIMEOUT_MINUTES * 60 * 1000
  );

  return session.lastActivityAt < timeoutThreshold;
};

export const deleteSession = async (
  sessionId: number
): Promise<void> => {
  await UserSessionModel.destroy({
    where: { id: sessionId },
  });
};

export const deleteSessionByToken = async (
  sessionToken: string
): Promise<void> => {
  await UserSessionModel.destroy({
    where: { sessionToken },
  });
};

export const getUserSessions = async (
  userId: number,
  status?: SessionStatus
): Promise<UserSessionDetails[]> => {
  const whereClause: Record<string, unknown> = { userId };
  if (status) {
    whereClause.status = status;
  }

  const sessions = await UserSessionModel.findAll({
    where: whereClause,
    order: [["lastActivityAt", "DESC"]],
  });

  return sessions;
};

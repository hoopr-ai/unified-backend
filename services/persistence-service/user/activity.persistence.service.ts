import {
  UserActivityModel,
  UserActivityDetails,
} from "./schemas/modules.export";

export const createActivity = async (
  activityDetails: UserActivityDetails
): Promise<UserActivityDetails> => {
  const activity = await UserActivityModel.create(activityDetails);
  return activity;
};

export const createActivitiesBulk = async (
  activities: UserActivityDetails[]
): Promise<UserActivityDetails[]> => {
  const createdActivities = await UserActivityModel.bulkCreate(activities);
  return createdActivities;
};

export const findActivitiesByUserId = async (
  userId: number,
  page: number = 1,
  limit: number = 50
): Promise<{ rows: UserActivityDetails[]; count: number }> => {
  const offset = (page - 1) * limit;

  const { rows, count } = await UserActivityModel.findAndCountAll({
    where: { userId },
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return { rows, count };
};

export const findActivitiesBySessionId = async (
  sessionId: number,
  page: number = 1,
  limit: number = 50
): Promise<{ rows: UserActivityDetails[]; count: number }> => {
  const offset = (page - 1) * limit;

  const { rows, count } = await UserActivityModel.findAndCountAll({
    where: { sessionId },
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return { rows, count };
};

export const findActivitiesByEndpoint = async (
  endpoint: string,
  page: number = 1,
  limit: number = 50
): Promise<{ rows: UserActivityDetails[]; count: number }> => {
  const offset = (page - 1) * limit;

  const { rows, count } = await UserActivityModel.findAndCountAll({
    where: { endpoint },
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return { rows, count };
};

export const findActivitiesByAction = async (
  action: string,
  page: number = 1,
  limit: number = 50
): Promise<{ rows: UserActivityDetails[]; count: number }> => {
  const offset = (page - 1) * limit;

  const { rows, count } = await UserActivityModel.findAndCountAll({
    where: { action },
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return { rows, count };
};

export const findActivitiesByDateRange = async (
  userId: number,
  startDate: Date,
  endDate: Date,
  page: number = 1,
  limit: number = 50
): Promise<{ rows: UserActivityDetails[]; count: number }> => {
  const { Op } = require("sequelize");
  const offset = (page - 1) * limit;

  const { rows, count } = await UserActivityModel.findAndCountAll({
    where: {
      userId,
      createdAt: {
        [Op.between]: [startDate, endDate],
      },
    },
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return { rows, count };
};

export const getActivityCountByUser = async (
  userId: number
): Promise<number> => {
  const count = await UserActivityModel.count({
    where: { userId },
  });

  return count;
};

export const getRecentActivitiesByUser = async (
  userId: number,
  limit: number = 10
): Promise<UserActivityDetails[]> => {
  const activities = await UserActivityModel.findAll({
    where: { userId },
    order: [["createdAt", "DESC"]],
    limit,
  });

  return activities;
};

export const deleteActivitiesBySessionId = async (
  sessionId: number
): Promise<number> => {
  const deletedCount = await UserActivityModel.destroy({
    where: { sessionId },
  });

  return deletedCount;
};

export const deleteActivitiesByUserId = async (
  userId: number
): Promise<number> => {
  const deletedCount = await UserActivityModel.destroy({
    where: { userId },
  });

  return deletedCount;
};

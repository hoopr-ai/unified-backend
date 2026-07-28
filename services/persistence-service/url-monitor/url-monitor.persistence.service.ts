import { Op } from "sequelize";
import {
  MonitoredUrlModel,
  MonitorCheckModel,
  type MonitoredUrlDetails,
  type MonitorCheckDetails,
} from "./schemas/modules.export";

export const saveMonitoredUrl = async (
  details: MonitoredUrlDetails
): Promise<MonitoredUrlModel> => {
  return MonitoredUrlModel.create(details);
};

export const findMonitoredUrlById = async (
  id: number
): Promise<MonitoredUrlModel | null> => {
  return MonitoredUrlModel.findByPk(id);
};

export const findAllMonitoredUrls = async (): Promise<MonitoredUrlModel[]> => {
  return MonitoredUrlModel.findAll({ order: [["createdAt", "ASC"]] });
};

export const findActiveMonitoredUrls = async (): Promise<MonitoredUrlModel[]> => {
  return MonitoredUrlModel.findAll({
    where: { isActive: true },
    order: [["createdAt", "ASC"]],
  });
};

export const updateMonitoredUrlById = async (
  id: number,
  updates: Partial<MonitoredUrlDetails>
): Promise<MonitoredUrlModel | null> => {
  const row = await MonitoredUrlModel.findByPk(id);
  if (!row) return null;
  await row.update(updates);
  return row;
};

export const deleteMonitoredUrlById = async (id: number): Promise<boolean> => {
  const row = await MonitoredUrlModel.findByPk(id);
  if (!row) return false;
  await MonitorCheckModel.destroy({ where: { urlId: id } });
  await row.destroy();
  return true;
};

export const saveMonitorCheck = async (
  details: MonitorCheckDetails
): Promise<MonitorCheckModel> => {
  return MonitorCheckModel.create(details);
};

export const findRecentChecks = async (
  urlId: number,
  hours: number
): Promise<MonitorCheckModel[]> => {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return MonitorCheckModel.findAll({
    where: { urlId, checkedAt: { [Op.gte]: since } },
    order: [["checkedAt", "ASC"]],
  });
};

// Prune history older than `days` — called by the monitor job so the checks
// table stays bounded (~288 rows/day per URL at a 5-minute cadence).
export const pruneChecksOlderThan = async (days: number): Promise<number> => {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return MonitorCheckModel.destroy({ where: { checkedAt: { [Op.lt]: cutoff } } });
};

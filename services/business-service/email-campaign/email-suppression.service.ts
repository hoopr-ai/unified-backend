import { AppError } from "../../helper-service/AppError";
import {
  upsertSuppression,
  listSuppressions,
  deleteSuppressionById,
} from "../../persistence-service/email-campaign/modules.export";
import {
  EmailSuppressionReason,
  type AddSuppressionRequestData,
} from "../../dto-service/email-campaign/modules.export";

export const listSuppressionsService = async (query: {
  page?: number;
  limit?: number;
  search?: string;
}) => {
  const page = query.page || 1;
  const limit = query.limit || 50;
  const { rows, count } = await listSuppressions({
    page,
    limit,
    search: query.search,
  });
  return { suppressions: rows, total: count, page, limit };
};

export const addSuppressionService = (
  payload: AddSuppressionRequestData,
  createdBy?: number
) =>
  upsertSuppression({
    email: payload.email.trim().toLowerCase(),
    reason: payload.reason || EmailSuppressionReason.MANUAL,
    detail: payload.detail ?? null,
    createdBy: createdBy ?? null,
  });

export const removeSuppressionService = async (id: string) => {
  const deleted = await deleteSuppressionById(id);
  if (!deleted) throw new AppError("Suppression not found", 404);
};

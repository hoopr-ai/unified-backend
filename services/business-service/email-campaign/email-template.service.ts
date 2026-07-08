import { AppError } from "../../helper-service/AppError";
import {
  createTemplate,
  findTemplateById,
  listTemplates,
  updateTemplate,
  softDeleteTemplate,
} from "../../persistence-service/email-campaign/modules.export";
import type {
  CreateEmailTemplateRequestData,
  UpdateEmailTemplateRequestData,
} from "../../dto-service/email-campaign/modules.export";

export const createTemplateService = (
  payload: CreateEmailTemplateRequestData,
  createdBy?: number
) =>
  createTemplate({
    name: payload.name,
    subject: payload.subject ?? null,
    html: payload.html,
    description: payload.description ?? null,
    createdBy: createdBy ?? null,
  });

export const listTemplatesService = async (query: {
  page?: number;
  limit?: number;
  search?: string;
}) => {
  const page = query.page || 1;
  const limit = query.limit || 20;
  const { rows, count } = await listTemplates({ page, limit, search: query.search });
  return { templates: rows, total: count, page, limit };
};

export const getTemplateService = async (id: string) => {
  const template = await findTemplateById(id);
  if (!template) throw new AppError("Template not found", 404);
  return template;
};

export const updateTemplateService = async (
  id: string,
  updates: UpdateEmailTemplateRequestData
) => {
  const template = await updateTemplate(id, updates);
  if (!template) throw new AppError("Template not found", 404);
  return template;
};

export const deleteTemplateService = async (id: string) => {
  const deleted = await softDeleteTemplate(id);
  if (!deleted) throw new AppError("Template not found", 404);
};

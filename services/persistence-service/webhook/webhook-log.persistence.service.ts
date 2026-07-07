import { WebhookLogModel, type WebhookLogAttributes } from "./schemas/webhook-log.schema";

export const createWebhookLog = async (data: WebhookLogAttributes): Promise<WebhookLogModel> => {
  return WebhookLogModel.create(data);
};

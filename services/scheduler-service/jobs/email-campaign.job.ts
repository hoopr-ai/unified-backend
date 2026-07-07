import { processCampaignBatch } from "../../business-service/email-campaign/email-campaign.service";
import type { ProcessBatchResult } from "../../dto-service/email-campaign/modules.export";
import { logger } from "../../helper-service/logger";

export const executeEmailCampaignBatch = async (): Promise<ProcessBatchResult> => {
  const result = await processCampaignBatch();
  if (result.processed > 0) {
    logger.info(
      `[EmailCampaign] Batch done — campaign=${result.campaignId} processed=${result.processed} sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`
    );
  }
  return result;
};

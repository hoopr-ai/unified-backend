import { Queue } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export interface BrandRecommendJobData {
  brandId?: number; // If not provided, process all brands
  filters?: Array<{
    type: "language" | "assortment" | "vocals";
    value: string[] | string;
  }>;
  limit?: number;
  railKey?: string; // Custom rail key (optional)
  pageName?: string;
}

export const brandRecommendQueue = new Queue<BrandRecommendJobData>(
  "brand-recommend",
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 60000,
      },
    },
  }
);

// Trigger brand recommendation for a specific brand or all brands
export const triggerBrandRecommend = async (
  data: BrandRecommendJobData
): Promise<void> => {
  await brandRecommendQueue.add("brand-recommend", data, {
    jobId: data.brandId
      ? `brand-recommend-${data.brandId}-${Date.now()}`
      : `brand-recommend-all-${Date.now()}`,
  });
};

import { Queue, Job } from "bullmq";
import { bullmqConnection } from "./queue.config";

export interface DownloadJobData {
  url: string;
  jobId: string;
  platform: "instagram" | "youtube" | "tiktok";
  createdAt: string;
}

export interface DownloadJobResult {
  title: string;
  video_url: string;
  thumbnail: string;
  duration?: number;
  formats?: Array<{
    format_id: string;
    ext: string;
    url: string;
    quality?: string;
  }>;
}

const QUEUE_NAME = "media-download";

export const downloadQueue = new Queue<DownloadJobData, DownloadJobResult>(
  QUEUE_NAME,
  {
    connection: bullmqConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        age: 1800, // Keep completed jobs for 30 minutes
        count: 5000, // Keep last 5000 completed jobs
      },
      removeOnFail: {
        age: 1800, // Keep failed jobs for 30 minutes
      },
    },
  }
);

export const addDownloadJob = async (
  url: string,
  jobId: string,
  platform: DownloadJobData["platform"] = "instagram"
): Promise<Job<DownloadJobData, DownloadJobResult>> => {
  const job = await downloadQueue.add(
    "download",
    {
      url,
      jobId,
      platform,
      createdAt: new Date().toISOString(),
    },
    {
      jobId, // Use our custom jobId as BullMQ jobId for easy lookup
    }
  );

  return job;
};

export const getJobStatus = async (
  jobId: string
): Promise<{
  status: string;
  progress: number;
  result?: DownloadJobResult;
  error?: string;
} | null> => {
  const job = await downloadQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress as number;

  if (state === "completed") {
    return {
      status: "completed",
      progress: 100,
      result: job.returnvalue,
    };
  }

  if (state === "failed") {
    return {
      status: "failed",
      progress: 0,
      error: job.failedReason || "Unknown error",
    };
  }

  return {
    status: state,
    progress: typeof progress === "number" ? progress : 0,
  };
};

export const getQueueStats = async () => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    downloadQueue.getWaitingCount(),
    downloadQueue.getActiveCount(),
    downloadQueue.getCompletedCount(),
    downloadQueue.getFailedCount(),
    downloadQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed,
  };
};

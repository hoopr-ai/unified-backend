import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  addDownloadJob,
  getJobStatus,
  getQueueStats,
} from "../services/helper-service/download-queue";
import {
  catchAsync,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";

// Supported platforms
const SUPPORTED_PLATFORMS = ["instagram", "youtube", "tiktok"] as const;
type Platform = (typeof SUPPORTED_PLATFORMS)[number];

// URL patterns for platform detection
const PLATFORM_PATTERNS: Record<Platform, RegExp> = {
  instagram: /^https?:\/\/(www\.)?instagram\.com\//,
  youtube: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//,
  tiktok: /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\//,
};

const detectPlatform = (url: string): Platform | null => {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) {
      return platform as Platform;
    }
  }
  return null;
};

const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Queue a new download job
 * POST /media-download
 * Body: { url: string, platform?: string }
 */
export const queueDownload = catchAsync(async (req: Request, res: Response) => {
  const { url, platform: requestedPlatform } = req.body;

  if (!url) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "URL is required", {});
  }

  if (!isValidUrl(url)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid URL format", {});
  }

  // Detect or validate platform
  const detectedPlatform = detectPlatform(url);
  const platform = (requestedPlatform || detectedPlatform || "instagram") as Platform;

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    return sendError(
      res,
      HttpStatusCode.BAD_REQUEST,
      `Unsupported platform. Supported: ${SUPPORTED_PLATFORMS.join(", ")}`,
      {}
    );
  }

  const jobId = uuidv4();

  await addDownloadJob(url, jobId, platform);

  sendResponse(res, {
    status: HttpStatusCode.ACCEPTED,
    data: {
      jobId,
      platform,
      message: "Download job queued successfully",
    },
    message: "Job queued",
  });
});

/**
 * Get download job status
 * GET /media-download/status/:jobId
 */
export const getDownloadStatus = catchAsync(async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;

  if (!jobId) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Job ID is required", {});
  }

  const status = await getJobStatus(jobId);

  if (!status) {
    return sendError(res, HttpStatusCode.NOT_FOUND, "Job not found", {});
  }

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: {
      jobId,
      ...status,
    },
    message: "Job status retrieved",
  });
});

/**
 * Get queue statistics
 * GET /media-download/stats
 */
export const getStats = catchAsync(async (req: Request, res: Response) => {
  const stats = await getQueueStats();

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: stats,
    message: "Queue statistics retrieved",
  });
});

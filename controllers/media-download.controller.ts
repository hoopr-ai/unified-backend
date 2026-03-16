import type { Request, Response } from "express";
import {
  getJobStatus,
  getQueueStats,
} from "../services/helper-service/download-queue";
import {
  catchAsync,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import {
  extractInstagramMedia,
  extractMultipleMedia,
  extractMultipleProfiles,
  isProfileUrl,
  isPostUrl,
} from "../services/helper-service/instagram-extractor";

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
 * Extract media from URLs (instant response, no queue)
 * POST /media-download
 *
 * Accepts:
 * - Single URL: { url: string }
 * - Multiple URLs: { urls: string[] }
 * - Profile URL auto-detected: fetches top N reels (videosOnly by default)
 * - Mixed: both url and urls can be provided
 *
 * Options:
 * - limit: number (default 10) - max reels to fetch from profile
 * - platform?: string - override platform detection
 */
export const queueDownload = catchAsync(async (req: Request, res: Response) => {
  const { url, urls, limit = 10, platform: requestedPlatform } = req.body;

  // Normalize inputs
  let allUrls: string[] = [];

  // Handle single URL
  if (url) {
    if (!isValidUrl(url)) {
      return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid URL format", {});
    }
    allUrls.push(url);
  }

  // Handle multiple URLs
  if (urls && Array.isArray(urls)) {
    for (const u of urls) {
      if (!isValidUrl(u)) {
        return sendError(res, HttpStatusCode.BAD_REQUEST, `Invalid URL format: ${u}`, {});
      }
      allUrls.push(u);
    }
  }

  // Must have at least one URL
  if (allUrls.length === 0) {
    return sendError(
      res,
      HttpStatusCode.BAD_REQUEST,
      "At least one URL is required. Use 'url' or 'urls' field.",
      {}
    );
  }

  // Separate profile URLs and post URLs
  const postUrls: string[] = [];
  const profileUrls: string[] = [];

  for (const u of allUrls) {
    const detectedPlatform = detectPlatform(u);
    const platform = (requestedPlatform || detectedPlatform) as Platform | null;

    // Only Instagram supports profile extraction for now
    if (platform === "instagram") {
      if (isProfileUrl(u)) {
        profileUrls.push(u);
      } else if (isPostUrl(u)) {
        postUrls.push(u);
      } else {
        return sendError(res, HttpStatusCode.BAD_REQUEST, `Invalid Instagram URL format: ${u}`, {});
      }
    } else if (platform) {
      // For other platforms, treat as post URL (no profile support yet)
      postUrls.push(u);
    } else {
      return sendError(
        res,
        HttpStatusCode.BAD_REQUEST,
        `Could not detect platform for URL: ${u}. Supported: ${SUPPORTED_PLATFORMS.join(", ")}`,
        {}
      );
    }
  }

  try {
    const results: {
      posts: { url: string; success: boolean; media?: any; error?: string }[];
      profiles: { url: string; username: string; success: boolean; profile?: any; reels?: any[]; error?: string }[];
      summary: { totalPosts: number; successfulPosts: number; totalProfiles: number; successfulProfiles: number; totalReels: number };
    } = {
      posts: [],
      profiles: [],
      summary: {
        totalPosts: postUrls.length,
        successfulPosts: 0,
        totalProfiles: profileUrls.length,
        successfulProfiles: 0,
        totalReels: 0,
      },
    };

    // Extract individual posts/reels
    if (postUrls.length > 0) {
      const postResults = await extractMultipleMedia(postUrls);
      results.posts = postResults.map((r) => ({
        url: r.url,
        success: r.success,
        media: r.media
          ? {
              title: r.media.title,
              video_url: r.media.video_url,
              thumbnail: r.media.thumbnail,
              author: r.media.author,
              type: r.media.type,
              duration: r.media.duration,
            }
          : undefined,
        error: r.error,
      }));
      results.summary.successfulPosts = postResults.filter((r) => r.success).length;
    }

    // Extract from profiles (reels only, limited by limit param)
    if (profileUrls.length > 0) {
      const profileResults = await extractMultipleProfiles(profileUrls, {
        videosOnly: true, // Only fetch reels/videos
        limitPerProfile: Math.min(limit, 50), // Cap at 50 for performance
      });
      results.profiles = profileResults.map((r) => ({
        url: r.url,
        username: r.username,
        success: r.success,
        profile: r.profile
          ? {
              username: r.profile.username,
              full_name: r.profile.full_name,
              biography: r.profile.biography,
              profile_pic: r.profile.profile_pic,
              post_count: r.profile.post_count,
              follower_count: r.profile.follower_count,
              following_count: r.profile.following_count,
            }
          : undefined,
        reels: r.media?.map((m) => ({
          title: m.title,
          video_url: m.video_url,
          thumbnail: m.thumbnail,
          author: m.author,
          type: m.type,
          duration: m.duration,
        })),
        error: r.error,
      }));
      results.summary.successfulProfiles = profileResults.filter((r) => r.success).length;
      results.summary.totalReels = profileResults.reduce(
        (sum, r) => sum + (r.media?.length || 0),
        0
      );
    }

    // For backward compatibility: if single post URL with no profiles, return simple response
    if (postUrls.length === 1 && profileUrls.length === 0 && results.posts[0]?.success) {
      return sendResponse(res, {
        status: HttpStatusCode.OK,
        data: results.posts[0].media,
        message: "Media extracted successfully",
      });
    }

    // For single profile URL, return simplified response
    if (profileUrls.length === 1 && postUrls.length === 0 && results.profiles[0]?.success) {
      return sendResponse(res, {
        status: HttpStatusCode.OK,
        data: {
          profile: results.profiles[0].profile,
          reels: results.profiles[0].reels,
          totalReels: results.profiles[0].reels?.length || 0,
        },
        message: `Extracted ${results.profiles[0].reels?.length || 0} reels from @${results.profiles[0].username}`,
      });
    }

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: results,
      message: `Extracted ${results.summary.successfulPosts} posts and ${results.summary.totalReels} reels from ${results.summary.successfulProfiles} profiles`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Extraction failed";
    return sendError(
      res,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      `Failed to extract media: ${errorMessage}`,
      {}
    );
  }
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

/**
 * Direct Instagram extraction (no queue, instant response)
 * POST /media-download/instagram
 *
 * Accepts either:
 * - Single URL: { url: string }
 * - Multiple URLs: { urls: string[] }
 * - Profile URLs: { profiles: string[], videosOnly?: boolean, limitPerProfile?: number }
 * - Mixed: { urls: string[], profiles: string[] }
 *
 * This endpoint extracts Instagram media directly without using yt-dlp
 * Works without authentication for public posts
 */
export const extractInstagram = catchAsync(async (req: Request, res: Response) => {
  const { url, urls, profiles, videosOnly = false, limitPerProfile = 50 } = req.body;

  // Normalize inputs
  let postUrls: string[] = [];
  let profileUrls: string[] = [];

  // Handle single URL (backward compatible)
  if (url) {
    if (!isValidUrl(url)) {
      return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid URL format", {});
    }
    if (!PLATFORM_PATTERNS.instagram.test(url)) {
      return sendError(res, HttpStatusCode.BAD_REQUEST, "URL must be an Instagram URL", {});
    }

    // Check if it's a profile or post URL
    if (isProfileUrl(url)) {
      profileUrls.push(url);
    } else if (isPostUrl(url)) {
      postUrls.push(url);
    } else {
      return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid Instagram URL format", {});
    }
  }

  // Handle multiple post/reel URLs
  if (urls && Array.isArray(urls)) {
    for (const u of urls) {
      if (!isValidUrl(u)) {
        return sendError(res, HttpStatusCode.BAD_REQUEST, `Invalid URL format: ${u}`, {});
      }
      if (!PLATFORM_PATTERNS.instagram.test(u)) {
        return sendError(res, HttpStatusCode.BAD_REQUEST, `Not an Instagram URL: ${u}`, {});
      }

      // Auto-detect if profile or post
      if (isProfileUrl(u)) {
        profileUrls.push(u);
      } else if (isPostUrl(u)) {
        postUrls.push(u);
      }
    }
  }

  // Handle profile URLs
  if (profiles && Array.isArray(profiles)) {
    for (const p of profiles) {
      if (!isValidUrl(p)) {
        return sendError(res, HttpStatusCode.BAD_REQUEST, `Invalid URL format: ${p}`, {});
      }
      if (!PLATFORM_PATTERNS.instagram.test(p)) {
        return sendError(res, HttpStatusCode.BAD_REQUEST, `Not an Instagram URL: ${p}`, {});
      }
      if (!isProfileUrl(p)) {
        return sendError(res, HttpStatusCode.BAD_REQUEST, `Not a profile URL: ${p}`, {});
      }
      profileUrls.push(p);
    }
  }

  // Must have at least one URL
  if (postUrls.length === 0 && profileUrls.length === 0) {
    return sendError(
      res,
      HttpStatusCode.BAD_REQUEST,
      "At least one URL is required. Use 'url', 'urls', or 'profiles' field.",
      {}
    );
  }

  try {
    const results: {
      posts: { url: string; success: boolean; media?: any; error?: string }[];
      profiles: { url: string; username: string; success: boolean; profile?: any; media?: any[]; error?: string }[];
      summary: { totalPosts: number; successfulPosts: number; totalProfiles: number; successfulProfiles: number; totalMedia: number };
    } = {
      posts: [],
      profiles: [],
      summary: {
        totalPosts: postUrls.length,
        successfulPosts: 0,
        totalProfiles: profileUrls.length,
        successfulProfiles: 0,
        totalMedia: 0,
      },
    };

    // Extract individual posts/reels
    if (postUrls.length > 0) {
      const postResults = await extractMultipleMedia(postUrls);
      results.posts = postResults.map((r) => ({
        url: r.url,
        success: r.success,
        media: r.media
          ? {
              title: r.media.title,
              video_url: r.media.video_url,
              thumbnail: r.media.thumbnail,
              author: r.media.author,
              type: r.media.type,
              duration: r.media.duration,
            }
          : undefined,
        error: r.error,
      }));
      results.summary.successfulPosts = postResults.filter((r) => r.success).length;
      results.summary.totalMedia += results.summary.successfulPosts;
    }

    // Extract from profiles
    if (profileUrls.length > 0) {
      const profileResults = await extractMultipleProfiles(profileUrls, {
        videosOnly,
        limitPerProfile,
      });
      results.profiles = profileResults.map((r) => ({
        url: r.url,
        username: r.username,
        success: r.success,
        profile: r.profile
          ? {
              username: r.profile.username,
              full_name: r.profile.full_name,
              biography: r.profile.biography,
              profile_pic: r.profile.profile_pic,
              post_count: r.profile.post_count,
              follower_count: r.profile.follower_count,
              following_count: r.profile.following_count,
            }
          : undefined,
        media: r.media?.map((m) => ({
          title: m.title,
          video_url: m.video_url,
          thumbnail: m.thumbnail,
          author: m.author,
          type: m.type,
          duration: m.duration,
        })),
        error: r.error,
      }));
      results.summary.successfulProfiles = profileResults.filter((r) => r.success).length;
      results.summary.totalMedia += profileResults.reduce(
        (sum, r) => sum + (r.media?.length || 0),
        0
      );
    }

    // For backward compatibility: if single post URL, return simple response
    if (postUrls.length === 1 && profileUrls.length === 0 && results.posts[0]?.success) {
      return sendResponse(res, {
        status: HttpStatusCode.OK,
        data: results.posts[0].media,
        message: "Instagram media extracted successfully",
      });
    }

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: results,
      message: `Extracted ${results.summary.totalMedia} media items`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Extraction failed";
    return sendError(
      res,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      `Failed to extract Instagram media: ${errorMessage}`,
      {}
    );
  }
});

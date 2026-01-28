import type { Request } from "express";
import { DeviceType, type SessionMetadata } from "../dto-service/modules.export";

/**
 * Parse user-agent string to extract browser, OS, and device type
 */
export const parseUserAgent = (userAgent: string): {
  browser: string;
  os: string;
  deviceType: DeviceType;
} => {
  let browser = "Unknown";
  let os = "Unknown";
  let deviceType = DeviceType.OTHER;

  const ua = userAgent.toLowerCase();

  // Detect Browser
  if (ua.includes("chrome") && !ua.includes("edg")) {
    browser = "Chrome";
  } else if (ua.includes("firefox")) {
    browser = "Firefox";
  } else if (ua.includes("safari") && !ua.includes("chrome")) {
    browser = "Safari";
  } else if (ua.includes("edg")) {
    browser = "Edge";
  } else if (ua.includes("opera") || ua.includes("opr")) {
    browser = "Opera";
  } else if (ua.includes("msie") || ua.includes("trident")) {
    browser = "Internet Explorer";
  }

  // Detect OS
  if (ua.includes("windows")) {
    os = "Windows";
    deviceType = DeviceType.DESKTOP;
  } else if (ua.includes("mac os") || ua.includes("macintosh")) {
    os = "macOS";
    deviceType = DeviceType.DESKTOP;
  } else if (ua.includes("linux") && !ua.includes("android")) {
    os = "Linux";
    deviceType = DeviceType.DESKTOP;
  } else if (ua.includes("android")) {
    os = "Android";
    deviceType = DeviceType.ANDROID;
  } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    os = "iOS";
    deviceType = DeviceType.IOS;
  }

  // Check if it's a mobile browser on desktop OS
  if (deviceType === DeviceType.DESKTOP && (ua.includes("mobile") || ua.includes("tablet"))) {
    deviceType = DeviceType.BROWSER;
  } else if (deviceType === DeviceType.DESKTOP) {
    deviceType = DeviceType.BROWSER;
  }

  return { browser, os, deviceType };
};

/**
 * Extract client IP address from request
 */
export const getClientIp = (req: Request): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return req.ip || req.socket.remoteAddress || "Unknown";
};

/**
 * Extract session metadata from request
 */
export const extractSessionMetadata = (req: Request): SessionMetadata => {
  const userAgent = req.headers["user-agent"] || "";
  const ipAddress = getClientIp(req);

  const { browser, os, deviceType } = parseUserAgent(userAgent);

  return {
    ipAddress,
    userAgent,
    browser,
    os,
    deviceType,
  };
};

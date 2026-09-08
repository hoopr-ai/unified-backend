import type { CorsOptions } from "cors";
import type { Request, Response, NextFunction } from "express";

// Browsers never send a trailing slash on Origin, so the list is compared
// normalised — a stray "https://internal.hoopr.ai/" entry would otherwise be
// dead weight that silently matches nothing.
const normalise = (origin: string): string => origin.replace(/\/+$/, "");

const ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];

const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "Accept",
  "Origin",
  "Access-Control-Request-Method",
  "Access-Control-Request-Headers",
];

const getAllowedOrigins = (): string[] => {
  const frontendUrl = process.env.FRONTEND_URL;

  return [
    frontendUrl,
    "http://localhost:5173",
    "https://internal.hoopr.ai",
    "https://dev-internal.hoopr.ai",
    "http://localhost:3002",
    "http://localhost:3000",
    "http://localhost:3003",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3003",
    "http://127.0.0.1:5174",
    "https://dev-enterprise.hoopr.ai",
    "https://smash.hoopr.ai",
    // smash.hoopr.ai is also served on www with no redirect, so the www origin
    // is a real one users arrive on — not an alias we can ignore.
    "https://www.smash.hoopr.ai",
    "https://www.hoopr.ai",
    "https://api-staging-enterprise.hoopr.ai",
    "https://api-smash.hoopr.ai",
    "https://api-dev-soundtracking.hoopr.ai",
  ]
    .filter((origin): origin is string => Boolean(origin))
    .map(normalise);
};

/**
 * Single source of truth for "may this origin talk to us". Both the cors
 * middleware and the guard below read it, so the two can never drift apart.
 */
export const isOriginAllowed = (origin: string): boolean => {
  const candidate = normalise(origin);

  if (getAllowedOrigins().includes(candidate)) {
    return true;
  }

  // Dev-only: any localhost/127.0.0.1 port, and file:// (origin === "null")
  const isDev = process.env.NODE_ENV !== "production";
  const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  return isDev && (localhostRegex.test(candidate) || candidate === "null");
};

/**
 * Answers requests from origins we do not allow, BEFORE cors() sees them.
 *
 * The point is that a blocked caller gets a response it can actually read.
 * Left to the cors middleware, a miss becomes `callback(new Error(...))` →
 * errorHandler → a bare 500 carrying no Access-Control-Allow-Origin; the
 * browser then discards it and axios reports the useless "Network Error",
 * which is indistinguishable from the API being down. That cost us a real
 * support ticket: www.smash.hoopr.ai serves the app but was not allow-listed,
 * and every user who landed on the www host saw "Network error" at login with
 * nothing in the backend logs, because the preflight died first.
 *
 * Two things here are deliberate and easy to get wrong:
 *
 *  - The PREFLIGHT is answered 204/OK even for a blocked origin. If it 403s,
 *    the browser refuses to send the real request and there is no body left to
 *    read — the whole point of the exercise. Preflight success is not itself
 *    an authorisation; the actual response below is what enforces the policy.
 *
 *  - Access-Control-Allow-Origin is echoed, Allow-Credentials is NOT. This
 *    response is a fixed error string and never reaches a route handler, so
 *    letting the caller read it leaks nothing. Adding credentials here would
 *    be the actual hole.
 */
export const corsOriginGuard = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const origin = req.headers.origin;

  // No Origin header (Postman, server-to-server, mobile) or a known good one —
  // hand it to cors() untouched.
  if (!origin || isOriginAllowed(origin)) {
    return next();
  }

  console.warn("[CORS] blocked origin:", origin, req.method, req.originalUrl);

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS.join(","));
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ?? ALLOWED_HEADERS.join(","),
    );
    // Never cache a preflight we are about to reject — the moment the origin is
    // added to the list, the next attempt must go through.
    res.setHeader("Access-Control-Max-Age", "0");
    res.status(204).end();
    return;
  }

  res.status(403).json({
    data: {},
    error: {
      code: 1,
      errorCode: "CORS_ORIGIN_NOT_ALLOWED",
      message: `This site (${origin}) is not authorised to use the Hoopr API. Please use https://smash.hoopr.ai.`,
    },
  });
};

/**
 * Get CORS configuration based on environment and allowed origins
 */
export const getCorsOptions = (): CorsOptions => {
  return {
    origin: (origin, callback) => {
      // Requests with no origin (Postman, mobile apps, etc.) are allowed.
      if (!origin || isOriginAllowed(origin)) {
        return callback(null, true);
      }

      // Unreachable in practice — corsOriginGuard answers these first. Returns
      // `false` rather than an Error so that even if the guard is ever unmounted
      // the failure mode is "no CORS headers", not a naked 500.
      return callback(null, false);
    },
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: ["Set-Cookie"],
    optionsSuccessStatus: 200,
  };
};

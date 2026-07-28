import type { Request, Response } from "express";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  saveMonitoredUrl,
  findAllMonitoredUrls,
  findMonitoredUrlById,
  updateMonitoredUrlById,
  deleteMonitoredUrlById,
  findRecentChecks,
} from "../services/persistence-service/url-monitor/modules.export";
import { runCheckForUrl } from "../services/business-service/url-monitor/modules.export";
import { historyQuerySchema } from "../middlewares/url-monitor.validation";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

const parseId = (raw: string): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("Invalid id", HttpStatusCode.BAD_REQUEST);
  }
  return id;
};

// GET /admin/url-monitor — all monitored URLs with their live status fields.
export const listMonitoredUrls = catchAsync(async (_req: Request, res: Response) => {
  const urls = await findAllMonitoredUrls();
  sendResponse(res, { data: { urls }, message: "Monitored URLs fetched" });
});

// POST /admin/url-monitor — create + run the first check inline so the row
// comes back with a real status instead of PENDING.
export const createMonitoredUrl = catchAsync(async (req: AuthRequest, res: Response) => {
  const row = await saveMonitoredUrl({
    ...req.body,
    createdBy: req.session?.userId ?? null,
  });
  try {
    await runCheckForUrl(row);
  } catch {
    // First check failing is not a create failure — the cron re-checks in <5m.
  }
  sendResponse(res, {
    status: HttpStatusCode.CREATED,
    data: { url: row },
    message: "Monitored URL created",
  });
});

// PUT /admin/url-monitor/:id
export const updateMonitoredUrl = catchAsync(async (req: Request, res: Response) => {
  const id = parseId(req.params.id as string);
  const updates = { ...req.body };
  // A changed target invalidates the previous status/SSL snapshot.
  if (typeof updates.url === "string") {
    Object.assign(updates, {
      lastStatus: "PENDING",
      lastStatusCode: null,
      lastResponseTimeMs: null,
      lastError: null,
      downSince: null,
      sslExpiresAt: null,
      sslDaysRemaining: null,
      sslIssuer: null,
      sslError: null,
      lastDownAlertAt: null,
      lastSslAlertAt: null,
    });
  }
  const row = await updateMonitoredUrlById(id, updates);
  if (!row) throw new AppError("Monitored URL not found", HttpStatusCode.NOT_FOUND);
  sendResponse(res, { data: { url: row }, message: "Monitored URL updated" });
});

// DELETE /admin/url-monitor/:id — hard delete (row + its check history).
export const deleteMonitoredUrl = catchAsync(async (req: Request, res: Response) => {
  const id = parseId(req.params.id as string);
  const deleted = await deleteMonitoredUrlById(id);
  if (!deleted) throw new AppError("Monitored URL not found", HttpStatusCode.NOT_FOUND);
  sendResponse(res, { data: { id }, message: "Monitored URL deleted" });
});

// POST /admin/url-monitor/:id/check — run a check right now and return the
// refreshed row (health + TLS, worst case ~15s on a dead host).
export const checkMonitoredUrlNow = catchAsync(async (req: Request, res: Response) => {
  const id = parseId(req.params.id as string);
  const row = await findMonitoredUrlById(id);
  if (!row) throw new AppError("Monitored URL not found", HttpStatusCode.NOT_FOUND);
  await runCheckForUrl(row);
  await row.reload();
  sendResponse(res, { data: { url: row }, message: "Check completed" });
});

// GET /admin/url-monitor/:id/history?hours=24 — check history for the charts.
export const getMonitoredUrlHistory = catchAsync(async (req: Request, res: Response) => {
  const id = parseId(req.params.id as string);
  const { value, error } = historyQuerySchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    throw new AppError(
      error.details.map((d) => d.message).join(", "),
      HttpStatusCode.BAD_REQUEST
    );
  }
  const row = await findMonitoredUrlById(id);
  if (!row) throw new AppError("Monitored URL not found", HttpStatusCode.NOT_FOUND);
  const checks = await findRecentChecks(id, value.hours);
  sendResponse(res, { data: { url: row, checks }, message: "History fetched" });
});

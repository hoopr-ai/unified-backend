import axios from "axios";
import tls from "node:tls";
import { URL } from "node:url";
import { sendEmail } from "../../helper-service/email.service";
import { logger } from "../../helper-service/logger";
import {
  MonitoredUrlModel,
  findActiveMonitoredUrls,
  findMonitoredUrlById,
  saveMonitorCheck,
  pruneChecksOlderThan,
} from "../../persistence-service/url-monitor/modules.export";

const HTTP_TIMEOUT_MS = 15_000;
const TLS_TIMEOUT_MS = 10_000;
const CHECK_CONCURRENCY = 5;
const HISTORY_RETENTION_DAYS = 30;
// Re-alert cadence while a condition persists (first alert is immediate).
const DOWN_REALERT_HOURS = 6;
const SSL_REALERT_HOURS = 24;

interface HealthResult {
  up: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
}

interface SslResult {
  expiresAt: Date | null;
  daysRemaining: number | null;
  issuer: string | null;
  error: string | null;
}

export interface MonitorRunSummary {
  total: number;
  up: number;
  down: number;
  alertsSent: number;
}

const truncate = (s: string, max = 500): string =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

// UP = we got an HTTP response with a non-error status. 5xx/timeouts/DNS
// failures are DOWN; 4xx is treated as DOWN too (the monitored endpoint is
// expected to serve its page, not reject the probe).
export const checkHealth = async (url: string): Promise<HealthResult> => {
  const started = Date.now();
  try {
    const res = await axios.get(url, {
      timeout: HTTP_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { "User-Agent": "Hoopr-Internal-Monitor/1.0" },
    });
    const responseTimeMs = Date.now() - started;
    const up = res.status < 400;
    return {
      up,
      statusCode: res.status,
      responseTimeMs,
      error: up ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      up: false,
      statusCode: null,
      responseTimeMs: Date.now() - started,
      error: truncate(err instanceof Error ? err.message : String(err)),
    };
  }
};

// Raw TLS handshake to read the certificate. rejectUnauthorized:false so an
// already-expired/invalid cert can still be inspected (and reported) instead
// of failing the connection outright.
export const checkSsl = (urlString: string): Promise<SslResult> => {
  const empty: SslResult = { expiresAt: null, daysRemaining: null, issuer: null, error: null };
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return Promise.resolve({ ...empty, error: "Invalid URL" });
  }
  if (parsed.protocol !== "https:") return Promise.resolve(empty);

  const host = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : 443;

  return new Promise<SslResult>((resolve) => {
    let settled = false;
    const finish = (result: SslResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const socket = tls.connect(
      { host, port, servername: host, rejectUnauthorized: false, timeout: TLS_TIMEOUT_MS },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || !cert.valid_to) {
          finish({ ...empty, error: "No certificate presented" });
          return;
        }
        const expiresAt = new Date(cert.valid_to);
        const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);
        const issuerRecord = cert.issuer as Record<string, string> | undefined;
        const issuer = issuerRecord?.O || issuerRecord?.CN || null;
        const error = socket.authorized
          ? null
          : truncate(String(socket.authorizationError ?? "Certificate not trusted"));
        finish({ expiresAt, daysRemaining, issuer, error });
      }
    );
    socket.on("timeout", () => finish({ ...empty, error: "TLS handshake timeout" }));
    socket.on("error", (err) => finish({ ...empty, error: truncate(err.message) }));
  });
};

const alertRecipients = (row: MonitoredUrlModel): string[] => {
  if (row.notifyEmails?.length) return row.notifyEmails;
  return (process.env.URL_MONITOR_ALERT_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const alertHtml = (title: string, color: string, rows: [string, string][]): string => `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;padding:30px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.08);">
      <div style="background:${color};color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold;">${title}</div>
      <table style="width:100%;border-collapse:collapse;padding:0;" cellpadding="0" cellspacing="0">
        ${rows
          .map(
            ([k, v]) => `
        <tr>
          <td style="padding:10px 24px;border-bottom:1px solid #f0f0f0;color:#848484;font-size:13px;white-space:nowrap;">${k}</td>
          <td style="padding:10px 24px;border-bottom:1px solid #f0f0f0;color:#1a1a1a;font-size:13px;word-break:break-all;">${v}</td>
        </tr>`
          )
          .join("")}
      </table>
      <div style="padding:14px 24px;color:#848484;font-size:12px;">Hoopr Internal · URL Monitoring</div>
    </div>
  </div>`;

const hoursSince = (d: Date | null | undefined): number =>
  d ? (Date.now() - new Date(d).getTime()) / 3_600_000 : Number.POSITIVE_INFINITY;

const formatDuration = (from: Date): string => {
  const mins = Math.max(1, Math.round((Date.now() - new Date(from).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
};

const sendAlert = async (
  row: MonitoredUrlModel,
  subject: string,
  html: string
): Promise<boolean> => {
  const to = alertRecipients(row).join(", ");
  if (!to) {
    logger.warn(`[UrlMonitor] No alert recipients for "${row.name}" — email skipped`);
    return false;
  }
  try {
    await sendEmail({ to, subject, html });
    return true;
  } catch (err) {
    logger.error(`[UrlMonitor] Failed to send alert email for "${row.name}":`, err);
    return false;
  }
};

// Check one URL end-to-end: HTTP health + TLS cert, persist the result, and
// fire alert emails on state transitions (with re-alert throttling).
export const runCheckForUrl = async (row: MonitoredUrlModel): Promise<{ up: boolean; alertsSent: number }> => {
  const [health, ssl] = await Promise.all([checkHealth(row.url), checkSsl(row.url)]);
  const now = new Date();
  const newStatus = health.up ? "UP" : "DOWN";
  const prevStatus = row.lastStatus;
  let alertsSent = 0;

  await saveMonitorCheck({
    urlId: row.id,
    status: newStatus,
    statusCode: health.statusCode,
    responseTimeMs: health.responseTimeMs,
    error: health.error,
    checkedAt: now,
  });

  const updates: Partial<MonitoredUrlModel> = {
    lastStatus: newStatus,
    lastStatusCode: health.statusCode,
    lastResponseTimeMs: health.responseTimeMs,
    lastError: health.error,
    lastCheckedAt: now,
    sslExpiresAt: ssl.expiresAt,
    sslDaysRemaining: ssl.daysRemaining,
    sslIssuer: ssl.issuer,
    sslError: ssl.error,
  };

  // ── Down / recovery transitions ────────────────────────────────────────
  if (!health.up) {
    const justWentDown = prevStatus !== "DOWN";
    updates.downSince = justWentDown ? now : row.downSince ?? now;
    const shouldAlert = justWentDown || hoursSince(row.lastDownAlertAt) >= DOWN_REALERT_HOURS;
    if (shouldAlert) {
      const sent = await sendAlert(
        row,
        `🔴 [Hoopr Monitor] ${row.name} is DOWN`,
        alertHtml(`${row.name} is DOWN`, "#b91c1c", [
          ["URL", row.url],
          ["Reason", health.error ?? "Unknown"],
          ["Status code", health.statusCode ? String(health.statusCode) : "No response"],
          ["Checked at", now.toUTCString()],
        ])
      );
      if (sent) {
        updates.lastDownAlertAt = now;
        alertsSent++;
      }
    }
  } else if (prevStatus === "DOWN") {
    updates.downSince = null;
    updates.lastDownAlertAt = null;
    const downFor = row.downSince ? formatDuration(row.downSince) : "unknown";
    const sent = await sendAlert(
      row,
      `🟢 [Hoopr Monitor] ${row.name} is back UP`,
      alertHtml(`${row.name} has recovered`, "#22443d", [
        ["URL", row.url],
        ["Downtime", downFor],
        ["Response time", health.responseTimeMs != null ? `${health.responseTimeMs} ms` : "—"],
        ["Recovered at", now.toUTCString()],
      ])
    );
    if (sent) alertsSent++;
  } else {
    updates.downSince = null;
  }

  // ── SSL expiry alert ───────────────────────────────────────────────────
  const sslExpiring =
    ssl.daysRemaining != null && ssl.daysRemaining <= (row.sslAlertDays ?? 30);
  if (sslExpiring && hoursSince(row.lastSslAlertAt) >= SSL_REALERT_HOURS) {
    const days = ssl.daysRemaining as number;
    const expired = days < 0;
    const sent = await sendAlert(
      row,
      expired
        ? `🔴 [Hoopr Monitor] SSL certificate for ${row.name} has EXPIRED`
        : `⚠️ [Hoopr Monitor] SSL certificate for ${row.name} expires in ${days} day${days === 1 ? "" : "s"}`,
      alertHtml(
        expired ? `SSL certificate expired — ${row.name}` : `SSL certificate expiring — ${row.name}`,
        expired ? "#b91c1c" : "#b45309",
        [
          ["URL", row.url],
          ["Expires", ssl.expiresAt ? ssl.expiresAt.toUTCString() : "—"],
          ["Days remaining", String(days)],
          ["Issuer", ssl.issuer ?? "—"],
        ]
      )
    );
    if (sent) {
      updates.lastSslAlertAt = now;
      alertsSent++;
    }
  } else if (!sslExpiring) {
    updates.lastSslAlertAt = null;
  }

  await row.update(updates);
  return { up: health.up, alertsSent };
};

// Full sweep — called by the 5-minute cron worker, or with a urlId for a
// manual "check now" of a single URL (paused URLs included when explicit).
export const executeUrlMonitor = async (urlId?: number): Promise<MonitorRunSummary> => {
  let targets: MonitoredUrlModel[];
  if (urlId != null) {
    const row = await findMonitoredUrlById(urlId);
    targets = row ? [row] : [];
  } else {
    targets = await findActiveMonitoredUrls();
  }

  const summary: MonitorRunSummary = { total: targets.length, up: 0, down: 0, alertsSent: 0 };

  for (let i = 0; i < targets.length; i += CHECK_CONCURRENCY) {
    const batch = targets.slice(i, i + CHECK_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((row) => runCheckForUrl(row)));
    for (const [idx, result] of results.entries()) {
      if (result.status === "fulfilled") {
        result.value.up ? summary.up++ : summary.down++;
        summary.alertsSent += result.value.alertsSent;
      } else {
        summary.down++;
        logger.error(`[UrlMonitor] Check crashed for "${batch[idx].name}":`, result.reason);
      }
    }
  }

  // Keep the history table bounded. Only on full sweeps, not manual re-checks.
  if (urlId == null && targets.length > 0) {
    await pruneChecksOlderThan(HISTORY_RETENTION_DAYS);
  }

  return summary;
};

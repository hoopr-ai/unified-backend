import {
  q,
  num,
  filterBinds,
  sessionWhere,
  type NativeFilters,
} from "./native-analytics-shared";
import { AppError } from "../../helper-service/AppError";

// The session explorer: a filterable list of real sessions, one session's full
// event timeline, and every session belonging to one visitor.
//
// This is the only part of the dashboard that reads RAW rows, and the only part
// affected by archiving: native_sessions is retained indefinitely, but
// native_events partitions move to GCS after the retention window. A session
// older than that still lists, and still shows its counters — its timeline
// comes back empty with `eventsArchived: true` rather than pretending nothing
// happened.

export interface SessionListFilters extends NativeFilters {
  /** Restrict to anonymous or identified sessions. */
  identity?: "all" | "anonymous" | "identified";
  /** Free text over visitor id, session key, user email, city or country. */
  search?: string | null;
  country?: string | null;
  /** Minimum session length, to skip one-request bounces when hunting for real journeys. */
  minDurationSeconds?: number | null;
  page: number;
  pageSize: number;
  sortBy?: "startedAt" | "durationSeconds" | "eventCount" | "pageViewCount";
  sortDir?: "asc" | "desc";
}

const SORTABLE: Record<string, string> = {
  startedAt: 's."startedAt"',
  durationSeconds: 's."durationSeconds"',
  eventCount: 's."eventCount"',
  pageViewCount: 's."pageViewCount"',
};

/**
 * Paginated session list.
 *
 * The sort column comes from a whitelist map, never from the request string —
 * an ORDER BY is not parameterisable, so the only safe form is a lookup that
 * cannot produce anything but one of four known expressions.
 */
export const getSessionsService = async (f: SessionListFilters) => {
  const orderColumn = SORTABLE[f.sortBy ?? "startedAt"] ?? SORTABLE.startedAt;
  const orderDir = f.sortDir === "asc" ? "ASC" : "DESC";
  const offset = (f.page - 1) * f.pageSize;

  const extra = `
    AND (CAST(:identityFilter AS text) IS NULL
         OR (:identityFilter = 'anonymous'  AND s."userId" IS NULL)
         OR (:identityFilter = 'identified' AND s."userId" IS NOT NULL))
    AND (CAST(:country AS text) IS NULL OR s."countryCode" = :country)
    AND (CAST(:minDuration AS int) IS NULL OR s."durationSeconds" >= :minDuration)
    AND (CAST(:search AS text) IS NULL
         OR s."visitorId" ILIKE :searchLike
         OR s."sessionKey" ILIKE :searchLike
         OR s.city       ILIKE :searchLike
         OR s.country    ILIKE :searchLike
         OR u.email      ILIKE :searchLike)`;

  const binds = {
    ...filterBinds(f),
    identityFilter:
      !f.identity || f.identity === "all" ? null : f.identity,
    country: f.country ?? null,
    minDuration: f.minDurationSeconds ?? null,
    search: f.search ?? null,
    searchLike: f.search ? `%${f.search}%` : null,
    limit: f.pageSize,
    offset,
  };

  // LEFT JOIN, not INNER: most sessions have no user, and an inner join here
  // would silently hide exactly the anonymous traffic this feature exists to
  // make visible.
  const from = `
    FROM native_sessions s
    LEFT JOIN users u ON u.id = s."userId"
   WHERE ${sessionWhere("s")} ${extra}`;

  const [rows, countRows] = await Promise.all([
    q<Record<string, unknown>>(
      `SELECT s.id, s."sessionKey", s."visitorId", s."userId",
              u.email, u."firstName", u."lastName",
              s."userPlatform", s."clientType", s.os, s."osVersion",
              s.browser, s."browserVersion", s."deviceType", s."deviceModel",
              s."deviceVendor", s."appVersion",
              s."countryCode", s.country, s.region, s.city,
              s.latitude, s.longitude, s."asnOrg", s.ip,
              s."landingPath", s."referrerDomain", s."utmSource", s."utmCampaign",
              s."shareToken", s."refCode",
              s."startedAt", s."lastSeenAt", s."endedAt", s."durationSeconds",
              s."eventCount", s."pageViewCount", s."isBounce", s."isReturning",
              s."isAuthenticated"
       ${from}
       ORDER BY ${orderColumn} ${orderDir} NULLS LAST, s.id DESC
       LIMIT :limit OFFSET :offset`,
      binds,
    ),
    q<{ total: unknown }>(`SELECT count(*) AS total ${from}`, binds),
  ]);

  const total = num(countRows[0]?.total);

  return {
    page: f.page,
    pageSize: f.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
    sessions: rows.map(shapeSession),
  };
};

/**
 * One session, with its full ordered timeline.
 *
 * Ordered by (occurredAt, id): occurredAt is the client's clock and a batch of
 * events posted together can share a millisecond, so the id breaks the tie and
 * keeps the timeline stable between reads.
 */
export const getSessionDetailService = async (sessionId: string) => {
  const sessionRows = await q<Record<string, unknown>>(
    `SELECT s.*, u.email, u."firstName", u."lastName"
       FROM native_sessions s
       LEFT JOIN users u ON u.id = s."userId"
      WHERE s.id = :sessionId`,
    { sessionId },
  );

  const session = sessionRows[0];
  if (!session) throw new AppError("Session not found.", 404);

  const events = await q<Record<string, unknown>>(
    `SELECT e.id, e."eventName", e."eventCategory", e.path, e."previousPath",
            e."targetType", e."targetId", e.properties, e."durationMs",
            e.source, e.endpoint, e.method, e."statusCode", e."responseTimeMs",
            e."occurredAt", e."receivedAt"
       FROM native_events e
      WHERE e."sessionId" = :sessionId
      ORDER BY e."occurredAt" ASC, e.id ASC
      LIMIT 5000`,
    { sessionId },
  );

  // The session says it had events but none are readable ⇒ its partition has
  // been archived. Saying so is the difference between "nothing happened" and
  // "the rows are in the bucket" — the ledger row names the object.
  const eventsArchived = events.length === 0 && num(session.eventCount) > 0;
  const archive = eventsArchived
    ? await q<Record<string, unknown>>(
        `SELECT a."partitionName", a."gcsBucket", a."gcsPath", a.status
           FROM native_analytics_archives a
          WHERE a."periodStart" <= (:startedAt)::date
            AND a."periodEnd"   >  (:startedAt)::date
          LIMIT 1`,
        { startedAt: String(session.startedAt) },
      )
    : [];

  return {
    session: shapeSession(session),
    timeline: events.map((e) => ({
      id: String(e.id),
      eventName: String(e.eventName),
      eventCategory: String(e.eventCategory),
      path: e.path === null ? null : String(e.path),
      previousPath: e.previousPath === null ? null : String(e.previousPath),
      targetType: e.targetType === null ? null : String(e.targetType),
      targetId: e.targetId === null ? null : String(e.targetId),
      properties: (e.properties as Record<string, unknown> | null) ?? null,
      durationMs: e.durationMs === null ? null : num(e.durationMs),
      source: String(e.source),
      endpoint: e.endpoint === null ? null : String(e.endpoint),
      method: e.method === null ? null : String(e.method),
      statusCode: e.statusCode === null ? null : num(e.statusCode),
      responseTimeMs: e.responseTimeMs === null ? null : num(e.responseTimeMs),
      occurredAt: new Date(String(e.occurredAt)).toISOString(),
      // Exposed so a large gap between the two is visible: it means the client
      // was offline and replayed later, not that the user sat idle.
      receivedAt: new Date(String(e.receivedAt)).toISOString(),
    })),
    eventsArchived,
    archiveLocation: archive[0]
      ? {
          partitionName: String(archive[0].partitionName),
          gcsBucket: String(archive[0].gcsBucket),
          gcsPath: String(archive[0].gcsPath),
          status: String(archive[0].status),
        }
      : null,
    // Timelines are capped; say so rather than silently truncating a long
    // session and letting someone conclude it ended where the list stops.
    timelineTruncated: events.length >= 5000,
  };
};

/**
 * Every session for one visitor, oldest first.
 *
 * This is the anonymous→identified story in one response: the early sessions
 * have no userId, the later ones do, and they are the same person on the same
 * device because `hoopr_vid` survives sign-in.
 */
export const getVisitorSessionsService = async (visitorId: string) => {
  const rows = await q<Record<string, unknown>>(
    `SELECT s.*, u.email, u."firstName", u."lastName"
       FROM native_sessions s
       LEFT JOIN users u ON u.id = s."userId"
      WHERE s."visitorId" = :visitorId
      ORDER BY s."startedAt" ASC
      LIMIT 500`,
    { visitorId },
  );

  if (rows.length === 0) throw new AppError("Visitor not found.", 404);

  const sessions = rows.map(shapeSession);
  const identified = sessions.find((s) => s.userId !== null);

  return {
    visitorId,
    sessionCount: sessions.length,
    firstSeen: sessions[0].startedAt,
    lastSeen: sessions[sessions.length - 1].lastSeenAt,
    // When this visitor stopped being anonymous, and how many sessions they had
    // spent unidentified before that — the pre-login funnel, per person.
    identifiedAs: identified
      ? {
          userId: identified.userId,
          email: identified.email,
          platform: identified.userPlatform,
          firstIdentifiedAt: identified.startedAt,
          anonymousSessionsBefore: sessions.filter(
            (s) => s.userId === null && s.startedAt < identified.startedAt,
          ).length,
        }
      : null,
    totalEvents: sessions.reduce((sum, s) => sum + s.eventCount, 0),
    totalDurationSeconds: sessions.reduce(
      (sum, s) => sum + (s.durationSeconds ?? 0),
      0,
    ),
    sessions,
  };
};

const str = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

const shapeSession = (s: Record<string, unknown>) => ({
  id: String(s.id),
  sessionKey: String(s.sessionKey),
  visitorId: String(s.visitorId),
  userId: str(s.userId),
  email: str(s.email),
  name:
    [s.firstName, s.lastName].filter(Boolean).join(" ").trim() || null,
  userPlatform: str(s.userPlatform),
  clientType: String(s.clientType),
  os: str(s.os),
  osVersion: str(s.osVersion),
  browser: str(s.browser),
  browserVersion: str(s.browserVersion),
  deviceType: str(s.deviceType),
  deviceModel: str(s.deviceModel),
  deviceVendor: str(s.deviceVendor),
  appVersion: str(s.appVersion),
  location: {
    countryCode: str(s.countryCode),
    country: str(s.country),
    region: str(s.region),
    city: str(s.city),
    latitude: s.latitude === null || s.latitude === undefined ? null : Number(s.latitude),
    longitude: s.longitude === null || s.longitude === undefined ? null : Number(s.longitude),
    isp: str(s.asnOrg),
  },
  ip: str(s.ip),
  acquisition: {
    landingPath: str(s.landingPath),
    referrerDomain: str(s.referrerDomain),
    utmSource: str(s.utmSource),
    utmCampaign: str(s.utmCampaign),
    shareToken: str(s.shareToken),
    refCode: str(s.refCode),
  },
  startedAt: new Date(String(s.startedAt)).toISOString(),
  lastSeenAt: new Date(String(s.lastSeenAt)).toISOString(),
  endedAt: s.endedAt ? new Date(String(s.endedAt)).toISOString() : null,
  durationSeconds:
    s.durationSeconds === null || s.durationSeconds === undefined
      ? null
      : num(s.durationSeconds),
  eventCount: num(s.eventCount),
  pageViewCount: num(s.pageViewCount),
  isBounce: s.isBounce === null || s.isBounce === undefined ? null : Boolean(s.isBounce),
  isReturning: Boolean(s.isReturning),
  isAuthenticated: Boolean(s.isAuthenticated),
  // A session with no endedAt is still in progress (or was never swept).
  isOpen: !s.endedAt,
});

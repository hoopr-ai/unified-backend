import {
  q,
  num,
  pct,
  per,
  filterBinds,
  rollupWhere,
  sessionWhere,
  eventWhere,
  type NativeFilters,
} from "./native-analytics-shared";

// Where visitors are, where they came from, and what they're running.
//
// Geography reads the rollup (so it works over unbounded history). Acquisition
// and the tech breakdown read raw native_sessions — which is safe for any range
// because only native_events is archived; the session table is retained
// indefinitely.

/**
 * Country / region / city rollup for the map and the table.
 *
 * Three independent levels rather than a nested tree: the map needs countries,
 * the table needs cities, and nobody has asked to expand a country into its
 * regions in the UI. Cheap to add later — the rollup already has the grain.
 */
export const getGeographyService = async (f: NativeFilters) => {
  const level = async (columns: string[]) => {
    const select = columns.map((c) => `r."${c}"`).join(", ");
    const rows = await q<Record<string, unknown>>(
      `SELECT ${select},
              COALESCE(sum(r.sessions), 0)         AS sessions,
              COALESCE(sum(r."uniqueVisitors"), 0) AS unique_visitors,
              COALESCE(sum(r."pageViews"), 0)      AS page_views
         FROM native_analytics_daily_geo r
        WHERE ${rollupWhere("r")}
        GROUP BY ${columns.map((_, i) => i + 1).join(", ")}
        ORDER BY sessions DESC
        LIMIT 500`,
      filterBinds(f),
    );
    return rows;
  };

  const [countries, regions, cities] = await Promise.all([
    level(["countryCode", "country"]),
    level(["countryCode", "country", "region"]),
    level(["countryCode", "country", "region", "city"]),
  ]);

  const shape = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({
      countryCode: String(r.countryCode ?? "UNKNOWN"),
      country: String(r.country ?? "UNKNOWN"),
      region: r.region === undefined ? undefined : String(r.region),
      city: r.city === undefined ? undefined : String(r.city),
      sessions: num(r.sessions),
      visitorDaysUnique: num(r.unique_visitors),
      pageViews: num(r.page_views),
    }));

  const shaped = shape(countries);
  const total = shaped.reduce((sum, c) => sum + c.sessions, 0);

  return {
    // Share is computed against the countries total, so it always sums to 100
    // even when the LIMIT clips a long tail.
    countries: shaped.map((c) => ({ ...c, share: pct(c.sessions, total) })),
    regions: shape(regions),
    cities: shape(cities),
    // Honest about coverage: geo is null whenever GeoLite2 could not resolve
    // the address (private ranges in dev, or a missing .mmdb entirely). Without
    // this the map silently under-reports and looks like a traffic drop.
    unresolvedShare: pct(
      shaped
        .filter((c) => c.countryCode === "UNKNOWN")
        .reduce((sum, c) => sum + c.sessions, 0),
      total,
    ),
  };
};

/**
 * Where traffic comes from: referrers, UTM campaigns, landing pages, and the
 * share attributable to the existing share/referral system.
 *
 * Reads raw native_sessions because acquisition lives on the session row and
 * was never rolled up — there is no need, since sessions are never pruned.
 */
export const getAcquisitionService = async (f: NativeFilters) => {
  const binds = filterBinds(f);
  const where = sessionWhere("s");

  // Aliased as a fixed lowercase `value`, never as the source column's name.
  // Postgres folds an unquoted alias to lower case, so `AS referrerDomain` comes
  // back as `referrerdomain` and every lookup by the camelCase key silently
  // reads undefined — which renders as "(none)" for every row.
  const group = async (
    expression: string,
    limit = 100,
  ): Promise<Array<Record<string, unknown>>> =>
    q<Record<string, unknown>>(
      `SELECT ${expression} AS value,
              count(*)                                            AS sessions,
              count(DISTINCT s."visitorId")                        AS visitors,
              count(*) FILTER (WHERE s."userId" IS NOT NULL)        AS identified,
              COALESCE(avg(s."durationSeconds"), 0)                AS avg_duration,
              count(*) FILTER (WHERE s."isBounce")                 AS bounces,
              count(*) FILTER (WHERE s."endedAt" IS NOT NULL)      AS closed
         FROM native_sessions s
        WHERE ${where}
        GROUP BY 1
        ORDER BY sessions DESC
        LIMIT ${limit}`,
      binds,
    );

  const shape = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({
      value: r.value === null || r.value === undefined ? "(none)" : String(r.value),
      sessions: num(r.sessions),
      visitors: num(r.visitors),
      identifiedSessions: num(r.identified),
      // Conversion-to-signed-in, which is the only conversion signal available
      // per traffic source without joining orders.
      identifiedShare: pct(num(r.identified), num(r.sessions)),
      avgSessionSeconds: Math.round(num(r.avg_duration)),
      bounceRate: pct(num(r.bounces), num(r.closed)),
    }));

  const [referrers, sources, campaigns, mediums, landing, channelRows] =
    await Promise.all([
      group(`COALESCE(s."referrerDomain", '(direct)')`),
      group(`COALESCE(s."utmSource", '(none)')`),
      group(`COALESCE(s."utmCampaign", '(none)')`),
      group(`COALESCE(s."utmMedium", '(none)')`),
      group(`COALESCE(s."landingPath", '(unknown)')`, 200),
      // The existing share/referral machinery, surfaced next to organic traffic
      // so the two can be compared at all. shareToken and refCode are copied
      // onto the session from the same `hoopr_ref` cookie that drives
      // native_referrals, so these numbers agree with that system by
      // construction rather than by coincidence.
      q<Record<string, unknown>>(
        `SELECT count(*)                                                     AS sessions,
                count(*) FILTER (WHERE s."shareToken" IS NOT NULL)            AS from_share,
                count(*) FILTER (WHERE s."refCode" IS NOT NULL)               AS from_referral,
                count(*) FILTER (WHERE s.gclid IS NOT NULL)                   AS from_google_ads,
                count(*) FILTER (WHERE s.fbclid IS NOT NULL)                  AS from_meta_ads,
                count(*) FILTER (WHERE s."referrerDomain" IS NULL
                                   AND s."utmSource" IS NULL)                 AS direct
           FROM native_sessions s
          WHERE ${where}`,
        binds,
      ),
    ]);

  const channels = channelRows[0] ?? {};
  const total = num(channels.sessions);

  return {
    referrers: shape(referrers),
    utmSources: shape(sources),
    utmCampaigns: shape(campaigns),
    utmMediums: shape(mediums),
    landingPages: shape(landing),
    channels: {
      total,
      fromShareLinks: num(channels.from_share),
      fromReferralCodes: num(channels.from_referral),
      fromGoogleAds: num(channels.from_google_ads),
      fromMetaAds: num(channels.from_meta_ads),
      direct: num(channels.direct),
      directShare: pct(num(channels.direct), total),
    },
  };
};

/**
 * The engineer's view: what devices are in use, and where things are breaking.
 *
 * Device mix comes from native_sessions; latency and error rates come from the
 * SERVER events the interceptor writes, which carry statusCode and
 * responseTimeMs per request.
 */
export const getTechHealthService = async (f: NativeFilters) => {
  const binds = filterBinds(f);

  // Same fixed lowercase `value` alias, for the same reason as `group` above.
  const deviceGroup = async (expression: string, limit = 50) =>
    q<Record<string, unknown>>(
      `SELECT ${expression} AS value,
              count(*)                        AS sessions,
              count(DISTINCT s."visitorId")    AS visitors
         FROM native_sessions s
        WHERE ${sessionWhere("s")}
        GROUP BY 1
        ORDER BY sessions DESC
        LIMIT ${limit}`,
      binds,
    );

  const [browsers, osVersions, devices, appVersions, perf, slowest, errors] =
    await Promise.all([
      deviceGroup(
        `COALESCE(s.browser, 'Unknown') || CASE WHEN s."browserVersion" IS NULL THEN '' ELSE ' ' || split_part(s."browserVersion", '.', 1) END`,
      ),
      deviceGroup(
        `COALESCE(s.os, 'Unknown') || CASE WHEN s."osVersion" IS NULL THEN '' ELSE ' ' || s."osVersion" END`,
      ),
      deviceGroup(
        `COALESCE(s."deviceVendor" || ' ' || s."deviceModel", COALESCE(s."deviceType", 'Unknown'))`,
      ),
      // Mobile only — appVersion is null on web, and a "null" bucket would
      // dominate a chart whose whole purpose is spotting a bad app build.
      deviceGroup(`s."appVersion"`),

      // Latency and error rate per platform. percentile_disc over responseTimeMs
      // rather than an average: an average latency hides exactly the tail that
      // users complain about.
      q<Record<string, unknown>>(
        `SELECT COALESCE(e."userPlatform", 'UNKNOWN') AS user_platform,
                COALESCE(e."clientType", 'UNKNOWN')   AS client_type,
                COALESCE(e.os, 'UNKNOWN')             AS os,
                count(*)                              AS requests,
                count(*) FILTER (WHERE e."statusCode" >= 500) AS server_errors,
                count(*) FILTER (WHERE e."statusCode" >= 400 AND e."statusCode" < 500) AS client_errors,
                percentile_disc(0.50) WITHIN GROUP (ORDER BY e."responseTimeMs") AS p50,
                percentile_disc(0.95) WITHIN GROUP (ORDER BY e."responseTimeMs") AS p95,
                percentile_disc(0.99) WITHIN GROUP (ORDER BY e."responseTimeMs") AS p99
           FROM native_events e
          WHERE ${eventWhere("e")}
            AND e.source = 'SERVER'
          GROUP BY 1, 2, 3
          ORDER BY requests DESC`,
        binds,
      ),

      q<Record<string, unknown>>(
        `SELECT e.endpoint,
                e.method,
                count(*) AS requests,
                percentile_disc(0.95) WITHIN GROUP (ORDER BY e."responseTimeMs") AS p95,
                COALESCE(avg(e."responseTimeMs"), 0) AS avg_ms
           FROM native_events e
          WHERE ${eventWhere("e")}
            AND e.source = 'SERVER'
            AND e.endpoint IS NOT NULL
          GROUP BY 1, 2
         HAVING count(*) >= 20
          ORDER BY p95 DESC NULLS LAST
          LIMIT 25`,
        binds,
      ),

      q<Record<string, unknown>>(
        `SELECT COALESCE(e.endpoint, e.path, '(unknown)') AS endpoint,
                e."statusCode" AS status_code,
                count(*) AS occurrences,
                count(DISTINCT e."sessionId") AS sessions,
                count(DISTINCT e."visitorId") AS visitors,
                max(e."occurredAt") AS last_seen
           FROM native_events e
          WHERE ${eventWhere("e")}
            AND (e."eventCategory" = 'ERROR' OR e."statusCode" >= 400)
          GROUP BY 1, 2
          ORDER BY occurrences DESC
          LIMIT 50`,
        binds,
      ),
    ]);

  const shapeDevice = (rows: Record<string, unknown>[]) => {
    const total = rows.reduce((sum, r) => sum + num(r.sessions), 0);
    return rows
      .filter((r) => r.value !== null && r.value !== undefined)
      .map((r) => ({
        value: String(r.value),
        sessions: num(r.sessions),
        visitors: num(r.visitors),
        share: pct(num(r.sessions), total),
      }));
  };

  return {
    browsers: shapeDevice(browsers),
    osVersions: shapeDevice(osVersions),
    devices: shapeDevice(devices),
    appVersions: shapeDevice(appVersions),
    performanceByPlatform: perf.map((r) => ({
      userPlatform: String(r.user_platform),
      clientType: String(r.client_type),
      os: String(r.os),
      requests: num(r.requests),
      serverErrors: num(r.server_errors),
      clientErrors: num(r.client_errors),
      errorRate: pct(
        num(r.server_errors) + num(r.client_errors),
        num(r.requests),
      ),
      p50Ms: num(r.p50),
      p95Ms: num(r.p95),
      p99Ms: num(r.p99),
    })),
    // Endpoints with fewer than 20 requests in range are excluded: a single
    // slow cold-start would otherwise top the list every time.
    slowestEndpoints: slowest.map((r) => ({
      endpoint: String(r.endpoint),
      method: String(r.method ?? ""),
      requests: num(r.requests),
      p95Ms: num(r.p95),
      avgMs: Math.round(num(r.avg_ms)),
    })),
    topErrors: errors.map((r) => ({
      endpoint: String(r.endpoint),
      statusCode: r.status_code === null ? null : num(r.status_code),
      occurrences: num(r.occurrences),
      sessions: num(r.sessions),
      visitors: num(r.visitors),
      lastSeen: r.last_seen ? new Date(String(r.last_seen)).toISOString() : null,
    })),
  };
};

/**
 * Visitor-level retention cohorts.
 *
 * Cohorted on VISITOR, not user — which is the point. A user-level cohort can
 * only ever describe people who signed up, and the question that matters at the
 * top of the funnel is whether anonymous visitors come back at all. Weekly
 * buckets because daily ones are too noisy at this volume to read.
 */
export const getRetentionService = async (f: NativeFilters) => {
  const rows = await q<Record<string, unknown>>(
    `WITH first_seen AS (
       SELECT s."visitorId",
              min(date_trunc('week', s."startedAt" AT TIME ZONE 'Asia/Kolkata')) AS cohort_week
         FROM native_sessions s
        WHERE NOT s."isBot"
          AND (CAST(:userPlatform AS text) IS NULL OR COALESCE(s."userPlatform",'UNKNOWN') = :userPlatform)
          AND (CAST(:clientType AS text) IS NULL OR COALESCE(s."clientType",'UNKNOWN') = :clientType)
          AND (CAST(:os AS text) IS NULL OR COALESCE(s."os",'UNKNOWN') = :os)
        GROUP BY 1
     ),
     -- Only cohorts whose FIRST week falls in the requested range, so the grid
     -- describes visitors acquired in the window rather than everyone who
     -- happened to return during it.
     cohorts AS (
       SELECT * FROM first_seen
        WHERE cohort_week >= date_trunc('week', (:startDate)::timestamp)
          AND cohort_week <= date_trunc('week', (:endDate)::timestamp)
     ),
     activity AS (
       SELECT c."visitorId",
              c.cohort_week,
              floor(
                EXTRACT(EPOCH FROM (
                  date_trunc('week', s."startedAt" AT TIME ZONE 'Asia/Kolkata') - c.cohort_week
                )) / 604800
              )::int AS week_offset
         FROM cohorts c
         JOIN native_sessions s ON s."visitorId" = c."visitorId"
        WHERE NOT s."isBot"
        GROUP BY 1, 2, 3
     )
     SELECT to_char(cohort_week, 'YYYY-MM-DD') AS cohort,
            week_offset,
            count(DISTINCT "visitorId")        AS visitors
       FROM activity
      WHERE week_offset BETWEEN 0 AND 12
      GROUP BY 1, 2
      ORDER BY 1, 2`,
    filterBinds(f),
  );

  const byCohort = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const cohort = String(r.cohort);
    if (!byCohort.has(cohort)) byCohort.set(cohort, new Map());
    byCohort.get(cohort)!.set(num(r.week_offset), num(r.visitors));
  }

  return {
    unit: "week",
    cohorts: [...byCohort.entries()].map(([cohort, offsets]) => {
      const size = offsets.get(0) ?? 0;
      return {
        cohort,
        size,
        // Week 0 is always 100% by definition; kept in the array so the grid
        // has a consistent first column.
        retention: Array.from({ length: 13 }, (_, week) => {
          const visitors = offsets.get(week) ?? 0;
          return {
            week,
            visitors,
            rate: pct(visitors, size),
          };
        }),
      };
    }),
  };
};

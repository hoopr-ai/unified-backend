// Smoke test: parsing, URL assembly and the generated INSERT. No DB connection.
process.env.DB_HOST ||= "localhost";
process.env.DB_PORT ||= "5432";
process.env.DB_USER ||= "x";
process.env.DB_PASSWORD ||= "x";
process.env.DB_NAME ||= "x";

import { Sequelize } from "sequelize-typescript";
import type { Request } from "express";
import { UtmLinkModel } from "../services/persistence-service/attribution/modules.export";
import {
  parseUtmTags,
  hasUtmTags,
  resolveDestinationUrl,
  buildFullUrl,
} from "../services/business-service/attribution/utm.attribution.service";

const assert = (label: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
};

// 1. Parsing, exactly as enterprise-fe sends it (getUtm() spread, snake_case).
const fromBody = parseUtmTags({
  ownerCode: ["43"],
  utm_source: "  youtube ",
  utm_medium: "video",
  utm_campaign: "sagamusic",
});
assert("trims tags", fromBody.utmSource === "youtube");
assert("missing tag is empty string", fromBody.utmTerm === "");
assert("tagged visit detected", hasUtmTags(fromBody));
assert("untagged visit ignored", !hasUtmTags(parseUtmTags({ ownerCode: ["43"] })));
assert(
  "caps a mangled tag",
  parseUtmTags({ utm_source: "x".repeat(400) }).utmSource!.length === 255,
);
assert("camelCase accepted", parseUtmTags({ utmSource: "yt" }).utmSource === "yt");

// 2. Query-string shape (GET /label-pages), where everything is a string.
const fromQuery = parseUtmTags({ activeOnly: "true", utm_source: "youtube" });
assert("query string parsed", fromQuery.utmSource === "youtube");
assert("non-utm query keys ignored", fromQuery.utmCampaign === "");

// 3. destination_url is the tagless landing page; full_url puts the tags back.
const req = (headers: Record<string, string>) =>
  ({ headers, protocol: "https", path: "/label-pages", get: () => "api-smash.hoopr.ai" }) as unknown as Request;

assert(
  "referer is the destination",
  resolveDestinationUrl(req({ referer: "https://smash.hoopr.ai/label/saga" })) ===
    "https://smash.hoopr.ai/label/saga",
);
assert(
  "utm_* stripped back off the referer",
  resolveDestinationUrl(
    req({ referer: "https://smash.hoopr.ai/?utm_source=youtube&page=2" }),
  ) === "https://smash.hoopr.ai/?page=2",
);
assert(
  "origin is the fallback",
  resolveDestinationUrl(req({ origin: "https://smash.hoopr.ai" })) ===
    "https://smash.hoopr.ai/",
);
assert(
  "own URL is the last resort (column is NOT NULL)",
  resolveDestinationUrl(req({})) === "https://api-smash.hoopr.ai/label-pages",
);

const full = buildFullUrl("https://smash.hoopr.ai/", fromBody);
assert("full_url carries the tags", full.includes("utm_source=youtube") && full.includes("utm_campaign=sagamusic"));
assert("empty tags are left off", !full.includes("utm_term="));

// 4. The row the model builds, checked against the columns `utm_links`
// actually has (\d utm_links on unified-backend-prod). This is the assertion
// that matters: the table is not ours to change, so an attribute mapped to a
// column that is not in this list is an INSERT that fails in production.
const COLUMNS = new Set([
  "id", "destination_url", "utm_source", "utm_medium", "utm_campaign",
  "campaign_objective", "campaign_region", "campaign_channel",
  "campaign_month_year", "utm_content", "utm_term", "full_url", "label",
  "created_by_email", "created_by_user_id", "created_at", "updated_at",
]);

const sequelize = new Sequelize({ dialect: "postgres", models: [UtmLinkModel] });
void sequelize;
const attributes = UtmLinkModel.getAttributes() as Record<string, { field?: string; allowNull?: boolean }>;
const mapped = Object.entries(attributes).map(([name, a]) => [name, a.field ?? name] as const);

console.log("\ncolumn mapping:");
for (const [name, field] of mapped) console.log(`  ${name} -> ${field}`);
console.log();

assert(
  "every attribute maps to a real utm_links column",
  mapped.every(([, field]) => COLUMNS.has(field)),
);
assert(
  "nothing is left on its camelCase property name",
  mapped.every(([name, field]) => field === name || /^[a-z_]+$/.test(field)),
);

const visit = UtmLinkModel.build({
  destinationUrl: "https://smash.hoopr.ai/",
  utmSource: "youtube",
  utmMedium: "video",
  utmCampaign: "sagamusic",
  utmContent: null,
  utmTerm: null,
  fullUrl: full,
  label: "visit:LABEL_PAGE_LIST",
  createdByEmail: null,
  createdByUserId: null,
});
assert("anonymous visit keeps a null user", visit.createdByUserId === null);
assert("label marks the row as a visit", visit.label!.startsWith("visit:"));

// The three NOT NULL text columns a visit has to fill itself. Everything else
// the table defaults or allows null.
const values = visit.get() as Record<string, unknown>;
assert(
  "every NOT NULL column a visit must fill is filled",
  ["destinationUrl", "utmSource", "utmMedium", "utmCampaign", "fullUrl"].every(
    (key) => typeof values[key] === "string",
  ),
);

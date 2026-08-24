// ─── CSV export ──────────────────────────────────────────────────────────────
//
// The thing this dashboard replaces was a spreadsheet
// (whitelist_subscribed_users_prod.xlsx, hand-generated against prod). Ops will
// still want to hand a list to someone outside the CMS, so export stays — but
// it is now a view of the SAME filtered query the screen is showing, not a
// separate script that can quietly drift from it.
//
// Columns deliberately mirror the spreadsheet's, minus the ones that were only
// there because a spreadsheet cannot link anywhere.

import type { ChannelFilters } from "./channels.service";
import { listChannelsService } from "./channels.service";
import type { ClaimFilters } from "./claims.service";
import { listClaimsService } from "./claims.service";

// Excel reads a bare 09674767955 as the number 9674767955 and eats the leading
// zero, which is how a support team ends up calling a wrong number. Quoting is
// not enough — the value has to be forced to text.
const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s === "") return "";
  const needsQuote = /[",\n\r]/.test(s);
  const body = needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
  return body;
};

const row = (values: unknown[]): string => values.map(cell).join(",");

const yesNo = (v: boolean | null | undefined): string => (v ? "Yes" : "No");

// Timestamps are rendered as **IST wall-clock**, not the raw UTC the services
// hand back. The filters above this export are IST calendar days, so a CSV that
// stamps "2026-08-23 19:10" on a channel the operator found under "24 Aug" is
// how an argument about the numbers starts. India is a fixed UTC+05:30 year
// round, so the shift is arithmetic and needs no timezone database.
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

const date = (v: string | null): string => {
  if (!v) return "";
  const ms = Date.parse(v);
  // Anything unparseable goes out verbatim rather than as an empty cell — a
  // value ops can question beats one that silently vanished.
  if (Number.isNaN(ms)) return v;
  return new Date(ms + IST_OFFSET_MS).toISOString().replace("T", " ").slice(0, 19);
};

// Exports are capped rather than streamed: the whole cohort is a few hundred
// rows today (52 channels at last count), and an unbounded SELECT behind an
// interactive button is how a CMS takes the shared DB down at 4pm.
const EXPORT_LIMIT = 5000;

export const exportChannelsCsvService = async (
  f: ChannelFilters,
): Promise<string> => {
  const { rows } = await listChannelsService({ ...f, page: 1, pageSize: EXPORT_LIMIT });

  const header = [
    "Profile ID", "User ID", "Name", "Email", "Mobile", "City", "Country",
    "Origin", "Channel platform", "Channel handle", "Channel link", "Channel ID",
    "Audience", "Verified", "Whitelist status", "Submitted at (IST)", "Days waiting",
    "Platform allowlist", "Allowlist provider", "Allowlist reference", "Allowlisted at (IST)",
    "Creator notified at (IST)", "Last action by", "Last action at (IST)",
    "Plan code", "Plan name", "Subscription status", "Subscription live now",
    "Channels allowed per platform", "Period end (IST)", "Subscribed at (IST)",
  ];

  return [
    row(header),
    ...rows.map((r) =>
      row([
        r.profileId, r.userId, r.name, r.email, r.mobile, r.city, r.country,
        r.originLabel, r.source, r.handle, r.channelUrl, r.identifier,
        r.audience, yesNo(r.verified), r.statusLabel, date(r.submittedAt), r.ageDays,
        r.allowlistStateLabel, r.allowlistProvider, r.allowlistRef, date(r.allowlistAt),
        date(r.notifiedAt), r.lastActionBy, date(r.lastActionAt),
        r.subscription.planCode, r.subscription.planName, r.subscription.status,
        yesNo(r.subscription.isLive), r.subscription.channelsAllowed,
        date(r.subscription.currentPeriodEnd), date(r.subscription.subscribedAt),
      ]),
    ),
  ].join("\n");
};

export const exportClaimsCsvService = async (f: ClaimFilters): Promise<string> => {
  const { rows } = await listClaimsService({ ...f, page: 1, pageSize: EXPORT_LIMIT });

  const header = [
    "Claim ID", "User ID", "Name", "Reply email", "Account email", "Mobile",
    "Origin", "Video platform", "Video URL", "Status", "Submitted at (IST)", "Days waiting",
    "Creator notified at (IST)", "Last action by", "Last action at (IST)", "Last note",
    "Plan code", "Plan name", "Subscription status", "Subscription live now",
  ];

  return [
    row(header),
    ...rows.map((r) =>
      row([
        r.id, r.userId, r.name, r.email, r.accountEmail, r.mobile,
        r.originLabel, r.platform, r.videoUrl, r.statusLabel,
        date(r.submittedAt), r.ageDays,
        date(r.notifiedAt), r.lastActionBy, date(r.lastActionAt), r.lastNote,
        r.subscription.planCode, r.subscription.planName, r.subscription.status,
        yesNo(r.subscription.isLive),
      ]),
    ),
  ].join("\n");
};

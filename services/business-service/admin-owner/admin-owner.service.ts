import { AppError } from "../../helper-service/AppError";
import {
  findOwnersForAdmin,
  findOwnerById,
  updateOwnerUsageInfo,
} from "../../persistence-service/owner/owner.persistence.service";
import type {
  AdminOwnerDetail,
  AdminOwnerListResponseData,
  UsageInfoDto,
} from "../../dto-service/owners/owners.dto";

// ---------------------------------------------------------------------------
// Internal-admin owner usage-info business layer. Thin orchestration over the
// owner persistence helpers — input is already validated by Joi at the route.
// The edited blob lands in owners.usageInfo and is surfaced verbatim by the
// public GET /tracks/:trackCode endpoint (transformTrackToDetailsDto).
// ---------------------------------------------------------------------------

const MAX_LIMIT = 100;

// An owner's usageInfo is a free-form JSONB blob. Normalise it into the DTO
// shape (arrays default to [], text stays optional) so partial/legacy records
// round-trip through the editor without crashing on missing keys.
const normalizeUsageInfo = (raw: unknown): UsageInfoDto | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const toStrArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    allowed: toStrArray(r.allowed),
    notAllowed: toStrArray(r.notAllowed),
    allowedPlatforms: toStrArray(r.allowedPlatforms),
    clearanceSummary: toStrArray(r.clearanceSummary),
    addYourLinksForClearance:
      typeof r.addYourLinksForClearance === "string"
        ? r.addYourLinksForClearance
        : undefined,
  };
};

// A usageInfo blob is "present" once any of its lists carry entries or the
// clearance text is set — an empty {} does not count as configured.
const hasMeaningfulUsageInfo = (info: UsageInfoDto | null): boolean =>
  info != null &&
  (info.allowed.length > 0 ||
    info.notAllowed.length > 0 ||
    info.allowedPlatforms.length > 0 ||
    info.clearanceSummary.length > 0 ||
    (info.addYourLinksForClearance?.trim().length ?? 0) > 0);

export interface ListOwnersInput {
  page: number;
  limit: number;
  search?: string;
}

export const listOwnersForAdminService = async (
  input: ListOwnersInput,
): Promise<AdminOwnerListResponseData> => {
  const page = Math.max(1, Math.floor(input.page));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(input.limit)));
  const offset = (page - 1) * limit;

  const { count, rows } = await findOwnersForAdmin(limit, offset, input.search);
  const totalPages = Math.max(1, Math.ceil(count / limit));

  return {
    owners: rows.map((owner) => ({
      id: owner.id,
      ownerCode: owner.ownerCode,
      name: owner.username ?? null,
      type: owner.type ?? null,
      hasUsageInfo: hasMeaningfulUsageInfo(normalizeUsageInfo(owner.usageInfo)),
    })),
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

const toDetail = (owner: {
  id: string;
  ownerCode: string;
  username?: string;
  type?: string;
  subType?: string;
  category?: string;
  usageInfo?: unknown;
}): AdminOwnerDetail => ({
  id: owner.id,
  ownerCode: owner.ownerCode,
  name: owner.username ?? null,
  type: owner.type ?? null,
  subType: owner.subType ?? null,
  category: owner.category ?? null,
  usageInfo: normalizeUsageInfo(owner.usageInfo),
});

export const getOwnerForAdminService = async (
  id: string,
): Promise<AdminOwnerDetail> => {
  const owner = await findOwnerById(id);
  if (!owner) {
    throw new AppError(`Owner ${id} not found.`, 404);
  }
  return toDetail(owner);
};

export const updateOwnerUsageInfoService = async (
  id: string,
  usageInfo: UsageInfoDto,
): Promise<AdminOwnerDetail> => {
  const owner = await updateOwnerUsageInfo(id, usageInfo);
  if (!owner) {
    throw new AppError(`Owner ${id} not found.`, 404);
  }
  return toDetail(owner);
};

export interface OwnerInfo {
  id: string;
  ownerCode: string;
  name: string | null;
  type: string | null;
  subType: string | null;
  category: string | null;
}

export interface GetAllOwnersResponseData {
  owners: OwnerInfo[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// ── Admin: owner usage-info CMS ───────────────────────────────────────────
// The structured license/clearance blob stored in owners.usageInfo (JSONB) and
// surfaced verbatim by GET /tracks/:trackCode. All fields optional so partial
// or legacy records round-trip cleanly through the editor.
export interface UsageInfoDto {
  allowed: string[];
  notAllowed: string[];
  allowedPlatforms: string[];
  clearanceSummary: string[];
  addYourLinksForClearance?: string;
}

// Row in the admin list — enough to render + search, plus a flag so the UI can
// badge owners that already have usage info configured.
export interface AdminOwnerListItem {
  id: string;
  ownerCode: string;
  name: string | null;
  type: string | null;
  hasUsageInfo: boolean;
}

export interface AdminOwnerListResponseData {
  owners: AdminOwnerListItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// Full detail returned by GET /admin/owners/:id and PUT .../usage-info.
export interface AdminOwnerDetail {
  id: string;
  ownerCode: string;
  name: string | null;
  type: string | null;
  subType: string | null;
  category: string | null;
  usageInfo: UsageInfoDto | null;
}

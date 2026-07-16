import { RailType, RailSourceType, RailItemType } from "./rail.enum";

export interface RailSeeMoreDescriptor {
  service: string;
  endpoint: string;
  params?: Record<string, unknown>;
}

export interface RailSourceConfig {
  preview?: RailSeeMoreDescriptor;
  seeMore?: RailSeeMoreDescriptor;
  [key: string]: unknown;
}

export interface RailItemResponse {
  itemType: RailItemType;
  itemCode: string;
  order: number;
  data: unknown;
}

export interface RailResponse {
  id: number;
  key: string;
  title: string;
  subtitle?: string | null;
  type: RailType;
  subType?: string | null;
  sourceType: RailSourceType;
  populateMode?: string | null;  // "MANUAL" | "AUTO" — drives the app endpoint
  pageName?: string;  // The page this rail belongs to
  order: number;
  items: RailItemResponse[];
  seeMore?: RailSeeMoreDescriptor | null;
  // Pinned into display tier 1 (above "Recommended For You"). Surfaced so the CMS
  // can show/round-trip the flag on edit; mirrors sourceConfig.pinnedTop.
  pinnedTop?: boolean;
  // ── CMS round-trip fields (same rationale as pinnedTop) ──────────────────
  // The internal Rails CMS re-opens rails in its edit wizard and needs the
  // original source configuration back, not just the hydrated display items.
  // Public clients ignore these extra keys.
  brandId?: number | null;
  isVisible?: boolean;
  pageNames?: string[];
  // MANUAL rails: the raw curated codes (unfiltered by hydration/page rules).
  itemCodes?: string[];
  // QUERY rails: snapshot of sourceConfig.query.
  query?: Record<string, unknown>;
  // AI_QUERY rails: sourceConfig.aiQuery with `headers` stripped (secrets).
  aiQuery?: Record<string, unknown>;
}

export interface PaginatedRailsResponse {
  rails: RailResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface RailSeeAllResponse {
  rail: {
    id: number;
    key: string;
    title: string;
    subtitle?: string | null;
    type: RailType;
    subType?: string | null;
    sourceType: RailSourceType;
    pageName?: string;
  };
  items: RailItemResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

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
  pageName?: string;  // The page this rail belongs to
  order: number;
  items: RailItemResponse[];
  seeMore?: RailSeeMoreDescriptor | null;
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

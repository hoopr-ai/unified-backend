import type { BrandStatus } from "./brand.enum";

export interface CreateBrandRequestData {
  organizationId: number;
  name: string;
  description?: string;
  status?: BrandStatus;
  insta_username?: string;
}

export interface CreateBrandResponseData {
  id: number;
  organizationId: number;
  name: string;
  description?: string;
  status: BrandStatus;
  createdAt: Date;
}

export interface UpdateBrandRequestData {
  name?: string;
  description?: string;
  status?: BrandStatus;
  insta_username?: string;
  // Owner IDs restricted for this brand (replaces existing list when provided)
  restrictedOwners?: string[];
  // Track tier values restricted for this brand (replaces existing list when provided)
  restrictedTrackTiers?: string[];
}

export interface BrandDetailResponseData {
  id: number;
  organizationId: number;
  name: string;
  description?: string;
  status: BrandStatus;
  insta_username?: string;
  restrictedTrackTiers: string[];
  // Resolved owner objects so the UI can display names, not just IDs
  restrictedOwners: { id: string; name: string; type: string | null }[];
  createdAt: Date;
}

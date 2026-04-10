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

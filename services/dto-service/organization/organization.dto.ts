import type { OrganizationStatus } from "./organization.enum";

export interface CreateOrganizationRequestData {
  name: string;
  description?: string;
  status?: OrganizationStatus;
}

export interface CreateOrganizationResponseData {
  id: number;
  name: string;
  description?: string;
  status: OrganizationStatus;
  createdAt: Date;
}

export interface UpdateOrganizationRequestData {
  name?: string;
  description?: string;
  status?: OrganizationStatus;
}

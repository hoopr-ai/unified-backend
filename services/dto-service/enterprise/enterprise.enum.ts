export enum EnterpriseStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
}

/**
 * OAuth2 scopes a B2B (enterprise) API client may be granted.
 * Scopes gate which endpoint groups a client token can reach.
 */
export enum EnterpriseScope {
  CATALOG_READ = "catalog:read",
  SEARCH = "search",
  ANALYTICS_READ = "analytics:read",
}

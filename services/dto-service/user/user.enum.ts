export enum UserStatus {
  ACTIVE = "ACTIVE",
  INVITED = "INVITED",
  DELETED = "DELETED",
}

export enum UserRoles {
  MASTER = "MASTER",
  ADMIN = "ADMIN",
  USER = "USER",
  SALES = "SALES",
  SONGFEST = "SONGFEST",
  IPRS = "IPRS",
  MUSIC = "MUSIC",
}

export enum SessionStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  EXPIRED = "EXPIRED",
}

export enum DeviceType {
  BROWSER = "BROWSER",
  ANDROID = "ANDROID",
  IOS = "IOS",
  DESKTOP = "DESKTOP",
  OTHER = "OTHER",
}

export enum ActivityAction {
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  VIEW = "VIEW",
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  SEARCH = "SEARCH",
  EXPORT = "EXPORT",
  IMPORT = "IMPORT",
  API_CALL = "API_CALL",
}

export enum ProfileRole {
  FOUNDER_LEADERSHIP = "FOUNDER_LEADERSHIP",
  MARKETING_BRAND = "MARKETING_BRAND",
  SOCIAL_CONTENT = "SOCIAL_CONTENT",
  CREATIVE_PRODUCTION = "CREATIVE_PRODUCTION",
  AGENCY_EXTERNAL = "AGENCY_EXTERNAL",
}

export const ProfileRoleDescriptions: Record<ProfileRole, string> = {
  [ProfileRole.FOUNDER_LEADERSHIP]: "Founders, CXOs, partners, business heads",
  [ProfileRole.MARKETING_BRAND]:
    "Brand managers, marketing managers, growth teams",
  [ProfileRole.SOCIAL_CONTENT]:
    "Social media managers, content strategists, community teams",
  [ProfileRole.CREATIVE_PRODUCTION]:
    "Video editors, filmmakers, in-house creatives, freelancers",
  [ProfileRole.AGENCY_EXTERNAL]:
    "Marketing agencies, production houses, consultants",
};

//make it 24 hours for now
export const SESSION_TIMEOUT_MINUTES = 24 * 60;

export enum AddressType {
  BUSINESS = "BUSINESS",
  BILLING = "BILLING",
}

export enum RedemptionStatus {
  PENDING = "P",
  APPROVED = "A",
  REJECTED = "R",
  COMPLETED = "C",
}

export enum ArtistUploadStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  PUBLISHED = "PUBLISHED",
}

export interface WebBannerResponseData {
  id: number;
  bannerCode: string | null;
  title: string;
  imageLink: string | null;
  mobileImageLink: string | null;
  linkPath: string | null;
  linkParams: Record<string, string> | null;
  isActive: boolean;
  createdAt: Date;
}

// ─── CMS write-side request shapes ───────────────────────────────────────────

export interface CreateWebBannerRequest {
  title: string;
  linkPath?: string;
  linkParams?: Record<string, string> | null;
  isActive?: boolean;
}

export interface UpdateWebBannerRequest {
  title?: string;
  linkPath?: string;
  linkParams?: Record<string, string> | null;
  isActive?: boolean;
}

/** Which crop a banner image upload targets. */
export type WebBannerImageVariant = "desktop" | "mobile";

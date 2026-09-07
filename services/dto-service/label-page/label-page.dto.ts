export interface LabelPageResponseData {
  id: number;
  ownerId: string;
  ownerCode: string;
  slug: string;
  title: string;
  description: string | null;
  heroImageLink: string | null;
  mobileHeroImageLink: string | null;
  logoImageLink: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  isActive: boolean;
  // The pageName every rail on this page carries — `LABEL_<ownerCode>`. Echoed
  // so the CMS never has to build the key itself, and so a renamed convention
  // stays a server-side concern.
  pageKey: string;
  // How many rails are currently on the page. Present on the list response
  // only; the detail call leaves it undefined.
  railCount?: number;
  createdAt: Date;
}

// ─── CMS write-side request shapes ───────────────────────────────────────────

export interface CreateLabelPageRequest {
  // The label this page belongs to. The owner must exist; its ownerCode is
  // read from the catalogue rather than trusted from the client.
  ownerId: string;
  // Optional overrides — both default to the owner's own name.
  title?: string;
  slug?: string;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  isActive?: boolean;
}

export interface UpdateLabelPageRequest {
  title?: string;
  slug?: string;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  isActive?: boolean;
}

/** Which artwork a label-page image upload targets. */
export type LabelPageImageVariant = "hero" | "mobile" | "logo";

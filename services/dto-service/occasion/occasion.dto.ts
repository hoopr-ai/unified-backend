export interface OccasionResponseData {
  id: number;
  title: string;
  month: string;
  date: string;
  className: string;
  end: string;
  occasionCode: string | null;
  imageLink: string | null;
  /** Editorial blurb under the hero on the storefront. Null when unwritten. */
  description: string | null;
  /**
   * The pageName every rail on this occasion's page carries
   * (OCCASION_<occasionCode>) — what the storefront passes to /rails/batch and
   * what the rails CMS files this page's rails under. Null for a legacy
   * occasion with no occasionCode, which therefore cannot own rails.
   */
  pageKey: string | null;
  createdAt: Date;
}

// ─── CMS write-side request shapes ───────────────────────────────────────────

export interface CreateOccasionRequest {
  title: string;
  month: string;
  date: string;
  className: string;
  end: string;
  description?: string | null;
}

export interface UpdateOccasionRequest {
  title?: string;
  month?: string;
  date?: string;
  className?: string;
  end?: string;
  description?: string | null;
}

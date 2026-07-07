export interface OccasionResponseData {
  id: number;
  title: string;
  month: string;
  date: string;
  className: string;
  end: string;
  occasionCode: string | null;
  imageLink: string | null;
  createdAt: Date;
}

// ─── CMS write-side request shapes ───────────────────────────────────────────

export interface CreateOccasionRequest {
  title: string;
  month: string;
  date: string;
  className: string;
  end: string;
}

export interface UpdateOccasionRequest {
  title?: string;
  month?: string;
  date?: string;
  className?: string;
  end?: string;
}

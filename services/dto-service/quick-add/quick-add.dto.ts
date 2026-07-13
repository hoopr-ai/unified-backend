export interface QuickAddResponseData {
  id: number;
  quickAddCode: string | null;
  label: string;
  imageLink: string | null;
  linkPath: string | null;
  linkParams: Record<string, string> | null;
  isActive: boolean;
  createdAt: Date;
}

// ─── CMS write-side request shapes ───────────────────────────────────────────

export interface CreateQuickAddRequest {
  label: string;
  linkPath?: string;
  linkParams?: Record<string, string> | null;
  isActive?: boolean;
}

export interface UpdateQuickAddRequest {
  label?: string;
  linkPath?: string;
  linkParams?: Record<string, string> | null;
  isActive?: boolean;
}

export interface LikeTrackRequestData {
  trackCode: string;
}

export interface UnlikeTrackRequestData {
  trackCode: string;
}

export interface LikedTrackResponse {
  trackCode: string;
  likedAt: Date;
}

export interface LikedTracksListResponse {
  tracks: LikedTrackWithDetails[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface LikedTrackWithDetails {
  trackCode: string;
  likedAt: Date;
  track?: {
    id: string;
    name?: string;
    duration?: number;
    mp3Link?: string;
    waveformLink?: string;
    artists?: {
      id: string;
      name?: string;
      isPrimary?: boolean;
    }[];
  };
}

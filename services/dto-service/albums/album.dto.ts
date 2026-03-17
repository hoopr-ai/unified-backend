export interface AlbumDto {
  id: string;
  title?: string;
  type?: string;
  trackCount: number;
  createdAt: Date;
}

export interface GetAlbumsRequestData {
  type?: string[];
  page?: string;
  limit?: string;
}

export interface GetAlbumsResponse {
  albums: AlbumDto[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface AlbumTracksResponse {
  tracks: import("../tracks/tracks.dto").TrackWithArtists[];
  totalCount: number;
}

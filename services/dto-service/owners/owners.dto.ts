export interface OwnerInfo {
  id: string;
  ownerCode: string;
  name: string | null;
}

export interface GetAllOwnersResponseData {
  owners: OwnerInfo[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

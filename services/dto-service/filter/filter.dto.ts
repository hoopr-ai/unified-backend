//get All filters DTO

export interface FilterItem {
  id: string;
  name: string;
  slug: string | null;
  rank: number | null;
}

export interface AssortmentItem {
  id: string;
  name: string;
  slug: string;
  rank: number;
}

export interface GroupedFilters {
  [key: string]: FilterItem[] | AssortmentItem[];
}

export interface GetAllFiltersResponse {
  filters: GroupedFilters;
}
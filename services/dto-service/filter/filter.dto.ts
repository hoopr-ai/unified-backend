//get All filters DTO

export interface FilterItem {
  id: string;
  name: string;
  slug: string | null;
  rank: number | null;
}

export interface GroupedFilters {
  [key: string]: FilterItem[];
}

export interface GetAllFiltersResponse {
  filters: GroupedFilters;
}
import {
  findAllActiveFilters,
  FilterDetails,
} from "../../persistence-service/exports";

interface FilterItem {
  id: string;
  name: string;
  slug: string | null;
}

interface GroupedFilters {
  [key: string]: FilterItem[];
}

interface GetAllFiltersResponse {
  filters: GroupedFilters;
}

export const getAllFiltersService = async (): Promise<GetAllFiltersResponse> => {
  const filters = await findAllActiveFilters();

  const groupedFilters: GroupedFilters = {};

  for (const filter of filters) {
    const type = filter.type?.toLowerCase() || "other";

    if (!groupedFilters[type]) {
      groupedFilters[type] = [];
    }

    groupedFilters[type].push({
      id: filter.id,
      name: filter.name,
      slug: filter.name_slug ?? null,
    });
  }

  return { filters: groupedFilters };
};

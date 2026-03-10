import { GetAllFiltersResponse, GroupedFilters, AssortmentItem } from "../../dto-service/modules.export";
import {
  findAllActiveFilters,
} from "../../persistence-service/exports";

const ASSORTMENT: AssortmentItem[] = [
  { id: "charbuster",       name: "Charbuster",       slug: "charbuster",       rank: 1 },
  { id: "international",    name: "International",    slug: "international",    rank: 2 },
  { id: "regional & indie", name: "Regional & Indie", slug: "regional-indie",   rank: 3 },
  { id: "hoopr originals",  name: "Hoopr Originals",  slug: "hoopr-originals",  rank: 4 },
];

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
      rank: filter.rank ?? null,
    });
  }

  // Sort each group by rank (nulls last), then alphabetically by name
  for (const type of Object.keys(groupedFilters)) {
    groupedFilters[type].sort((a, b) => {
      if (a.rank === null && b.rank === null) return a.name.localeCompare(b.name);
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank;
    });
  }

  return { filters: groupedFilters, assortment: ASSORTMENT };
};

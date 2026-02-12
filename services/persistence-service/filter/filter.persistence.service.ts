import { FilterModel, FilterDetails } from "./schemas/filter.schema";
import { TrackFilterMappingModel } from "./schemas/track-filter-mapping.schema";
import { FilterStatus } from "../../dto-service/modules.export";

export const findAllActiveFilters = async (): Promise<FilterDetails[]> => {
  const filters = await FilterModel.findAll({
    where: { status: FilterStatus.ACTIVE },
    include: [
      {
        model: TrackFilterMappingModel,
        as: "trackMappings",
        required: true, // INNER JOIN - only include filters that have at least one mapping
        attributes: [], // We don't need the mapping data, just checking existence
      },
    ],
    group: ["FilterModel.id"], // Group by filter to avoid duplicates
    order: [["name", "ASC"]],
  });
  return filters;
};

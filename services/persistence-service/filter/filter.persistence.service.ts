import { FilterModel, FilterDetails } from "./schemas/filter.schema";
import { FilterStatus } from "../../dto-service/modules.export";

export const findAllActiveFilters = async (): Promise<FilterDetails[]> => {
  const filters = await FilterModel.findAll({
    where: { status: FilterStatus.ACTIVE },
    order: [["name", "ASC"]],
  });
  return filters;
};

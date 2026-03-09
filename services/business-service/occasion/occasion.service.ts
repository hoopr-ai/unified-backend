import { findAllOccasions } from "../../persistence-service/occasion/modules.export";
import type { OccasionResponseData } from "../../dto-service/occasion/modules.export";

export const getOccasionsService = async (): Promise<OccasionResponseData[]> => {
  const occasions = await findAllOccasions();
  return occasions.map((o) => ({
    id: o.id!,
    title: o.title,
    month: o.month,
    date: o.date,
    className: o.className,
    end: o.end,
    createdAt: o.createdAt!,
  }));
};

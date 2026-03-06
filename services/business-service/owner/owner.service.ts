import { findAllOwners } from "../../persistence-service/owner/owner.persistence.service";
import { GetAllOwnersResponseData } from "../../dto-service/owners/owners.dto";

export const getAllOwnersService = async (
  pageStr?: string,
  limitStr?: string,
): Promise<GetAllOwnersResponseData> => {
  const page = Math.max(parseInt(pageStr || "1", 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(limitStr || "50", 10) || 50, 1), 200);
  const offset = (page - 1) * limit;

  const { count, rows } = await findAllOwners(limit, offset);
  const totalPages = Math.ceil(count / limit);

  return {
    owners: rows.map((owner) => ({
      id: owner.id,
      ownerCode: owner.ownerCode,
      name: owner.username ?? null,
      type: owner.type?? null,
      subType: owner.subType?? null,
    })),
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

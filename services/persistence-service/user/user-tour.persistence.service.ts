import {
  UserTourSeenModel,
  type UserTourSeenAttributes,
} from "./schemas/user-tour-seen.schema";

// Idempotent and permanent: findOrCreate inserts once and no-ops on repeat
// (UNIQUE(userId, tour) backs it under concurrent calls). A seen tour never
// flips back to unseen.
export const markTourSeen = async (
  userId: number,
  tour: string,
): Promise<void> => {
  await UserTourSeenModel.findOrCreate({
    where: { userId, tour },
    defaults: { userId, tour } as UserTourSeenAttributes,
  });
};

export const listToursSeen = async (userId: number): Promise<string[]> => {
  const rows = (await UserTourSeenModel.findAll({
    where: { userId },
    attributes: ["tour"],
    raw: true,
  })) as unknown as Array<{ tour: string }>;
  return rows.map((r) => r.tour);
};

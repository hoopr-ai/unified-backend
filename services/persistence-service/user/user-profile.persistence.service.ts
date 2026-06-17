import { UserProfileModel, type UserProfileAttributes } from "./schemas/user-profile.schema";

export const upsertUserProfile = async (
  userId: number,
  data: Pick<UserProfileAttributes, "instagramLink" | "youtubeLink" | "facebookLink">,
): Promise<void> => {
  await UserProfileModel.upsert({ userId, ...data });
};

export const findUserProfile = async (
  userId: number,
): Promise<UserProfileAttributes | null> => {
  return await UserProfileModel.findOne({ where: { userId } });
};

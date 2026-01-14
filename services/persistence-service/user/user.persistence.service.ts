import type { Platform } from "../../dto-service/constants/modules.export";
import { UserStatus } from "../../dto-service/modules.export";
import { AppError } from "../../helper-service/AppError";
import { UserModel, type UserDetails } from "./schemas/modules.export";

export const findActiveUser = async (email: string, platform: Platform): Promise<UserDetails> => {
    const userDetails =  await UserModel.findOne({
      where: { email, platform, status: UserStatus.ACTIVE },
    });
    if (!userDetails) {
      throw new AppError("User not found", 404);
    }
    return userDetails;
  }
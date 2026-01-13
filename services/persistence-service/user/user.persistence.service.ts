import { AppError } from "../../helper-service/AppError";
import { UserModel, type UserDetails } from "./schemas/modules.export";

export const findByEmail = async (email: string): Promise<UserDetails> => {
    const userDetails =  await UserModel.findOne({
      where: { email },
    });
    if (!userDetails) {
      throw new AppError("User not found", 404);
    }
    return userDetails;
  }
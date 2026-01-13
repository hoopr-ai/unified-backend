import { UserModel, type UserDetails } from "./schemas/modules.export";

export const findByEmail = async (email: string): Promise<UserDetails> => {
    const userDetails =  await UserModel.findOne({
      where: { email },
    });
    if (!userDetails) {
      const error = new Error("User not found") as any;
      error.statusCode = 404;
      throw error;
    }
    return userDetails;
  }
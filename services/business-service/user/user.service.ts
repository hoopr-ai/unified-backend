import bcrypt from "bcrypt";
import type { LoginUserRequestData, LoginResponse, UserRow } from "../../dto-service/modules.export";
import { formatDate } from "../../helper-service/date-formatting.service";
import { findByEmail, type UserDetails } from "../../persistence-service/exports";
import { createJWTToken } from "../../helper-service/modules.export";

const createLoginUserREsponse = (user: UserDetails, formattedCreatedAt: string, token: string) : LoginResponse => {
    const userData = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      created_at: formattedCreatedAt,
      updated_at: formattedCreatedAt,
      expiresIn: 3 * 60 * 60,
    };

    return { token, userData };
}

export const loginService = async (
  data: LoginUserRequestData
): Promise<LoginResponse> => {
  try {
    const { email, password } = data;
    const user = await findByEmail(email);
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      const error = new Error("Incorrect password") as any;
      error.statusCode = 401;
      throw error;
    }
    const token = createJWTToken({
        userId: user.id,
        email: user.email,
      },"3h");
    const formattedCreatedAt = formatDate(user.created_at);
    const loginUserRequestData = createLoginUserREsponse(user, formattedCreatedAt, token);
    return loginUserRequestData;
  } catch (error: any) {
    console.error("Error in loginService:", error.message);
    throw error;
  }
};

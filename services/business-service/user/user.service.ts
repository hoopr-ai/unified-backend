import bcrypt from "bcrypt";
import type { LoginUserRequestData, LoginResponse, UserRow } from "../../dto-service/modules.export";
import { formatDate } from "../../helper-service/date-formatting.service";
import { findByEmail, type UserDetails } from "../../persistence-service/exports";
import { AppError, createJWTToken } from "../../helper-service/modules.export";


const buildLoginResponse = (
  user: UserDetails,
  formattedCreatedAt: string,
  token: string
): LoginResponse => {
  return {
    token,
    userData: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      created_at: formattedCreatedAt,
      updated_at: formattedCreatedAt,
      expiresIn: 3 * 60 * 60
    }
  };
};

export const loginService = async (data: LoginUserRequestData): Promise<LoginResponse> => {
  const { email, password } = data;
  const user = await findByEmail(email);
  if (!user) {
    throw new AppError("User not found", 404);
  }
  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    throw new AppError("Incorrect password", 401);
  }
  const token = createJWTToken(
    { userId: user.id, email: user.email },
    "3h"
  );
  const formattedCreatedAt = formatDate(user.created_at);
  return buildLoginResponse(user, formattedCreatedAt, token);
};

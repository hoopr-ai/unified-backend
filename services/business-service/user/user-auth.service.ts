import bcrypt from "bcrypt";
import { type LoginUserRequestData, type LoginResponse, type UserRow, AccessTokenExpiry } from "../../dto-service/modules.export";
import { formatDate } from "../../helper-service/date-formatting.service";
import { findActiveUser, type UserDetails } from "../../persistence-service/exports";
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
      createdAt: formattedCreatedAt,
      updatedAt: formattedCreatedAt,
      expiresIn: 3 * 60 * 60
    }
  };
};

export const loginService = async (data: LoginUserRequestData): Promise<LoginResponse> => {
  const { email, password, platform } = data;
  const user = await findActiveUser(email, platform);
  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    throw new AppError("Incorrect password", 401);
  }
  const token = createJWTToken( { userId: user.id, email: user.email, platform: user.platform  }, AccessTokenExpiry);
  const formattedCreatedAt = formatDate(user.createdAt);
  return buildLoginResponse(user, formattedCreatedAt, token);
};

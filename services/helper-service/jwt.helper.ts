import jwt from "jsonwebtoken";
import type { SignOptions, JwtPayload } from "jsonwebtoken";
export const createJWTToken = (
  data: JwtPayload,
  expiresIn: string
): string => {
  const token = jwt.sign(
    data,
    process.env.JWT_SECRET_KEY as string,
    { expiresIn } as SignOptions
  );

  return token;
};

export interface LoginUserRequestData {
    email: string;
    password: string;
}


export interface UserRow {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  password: string;
  welcome_email_sent?: boolean;
}

export interface LoginResponse {
  token: string;
  userData: {
    id: number;
    email: string;
    firstName: string | undefined;
    lastName: string | undefined;
    createdAt: string;
    updatedAt: string;
    expiresIn: number;
  };
}
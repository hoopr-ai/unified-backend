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
  created_at: string;
  updated_at: string;
  password_hash: string;
  welcome_email_sent?: boolean;
}

export interface LoginResponse {
  token: string;
  userData: {
    id: number;
    email: string;
    firstName: string | undefined;
    lastName: string | undefined;
    created_at: string;
    updated_at: string;
    expiresIn: number;
  };
}
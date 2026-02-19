export interface SendOtpRequestData {
  mobile: string;
}

export interface VerifyOtpRequestData {
  mobile: string;
  otp: string;
}

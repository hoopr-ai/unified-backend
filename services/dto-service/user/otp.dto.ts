export interface SendOtpRequestData {
  mobile: string;
  countryCode: string;
}

export interface VerifyOtpRequestData {
  mobile: string;
  countryCode: string;
  otp: string;
}

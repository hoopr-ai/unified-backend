import axios from "axios";

const ENABLEX_APP_ID = process.env.ENABLEX_APP_ID as string;
const ENABLEX_APP_KEY = process.env.ENABLEX_APP_KEY as string;
const ENABLEX_CAMPAIGN_ID = Number(process.env.ENABLEX_CAMPAIGN_ID);
const ENABLEX_TEMPLATE_ID = Number(process.env.ENABLEX_TEMPLATE_ID);

export const sendOtpSms = async (
  mobile: string,
  otp: string,
  countryCode: string = "91",
): Promise<void> => {
  const payload = {
    type: "sms",
    data_coding: "plain",
    campaign_id: ENABLEX_CAMPAIGN_ID,
    to: [`${countryCode}${mobile}`],
    from: "HOOPRO",
    template_id: ENABLEX_TEMPLATE_ID,
    reference: "",
    type_details: "",
    flash_message: false,
    data: { var1: otp },
  };

  const response = await axios.post(
    "https://api.enablex.io/sms/v1/messages/",
    payload,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${ENABLEX_APP_ID}:${ENABLEX_APP_KEY}`,
        ).toString("base64")}`,
      },
    },
  );

  if (response?.data?.result !== 0) {
    throw new Error(response?.data?.error || "Failed to send OTP via SMS");
  }
};

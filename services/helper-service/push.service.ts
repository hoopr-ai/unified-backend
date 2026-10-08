import axios from "axios";
import { logger } from "./logger";

// Web/mobile push via OneSignal (the bridge provider the trial journey doc
// picked while Customer.io is evaluated). Users are addressed by OneSignal's
// external_id alias, which the FE must set to our user id after login:
//   OneSignal.login(String(user.id))
//
//   ONE_SIGNAL_APP_ID   OneSignal app id
//   ONE_SIGNAL_API_KEY  REST API key ("Key …" auth)
// Unset → isPushConfigured() is false and the journey records the push slot
// as skipped; its in-app inbox copy still shows.

const API_URL = "https://api.onesignal.com/notifications";

export const isPushConfigured = (): boolean =>
  Boolean(process.env.ONE_SIGNAL_APP_ID && process.env.ONE_SIGNAL_API_KEY);

export interface SendPushOptions {
  // One notification to all of them (OneSignal takes up to 2,000 aliases).
  userIds: number[];
  title: string;
  body: string;
  url: string;
  // Echoed back in the click payload so the FE can report the open.
  data?: Record<string, string | number>;
}

export interface SendPushResult {
  // OneSignal notification id; empty when nobody was targeted.
  id: string | null;
  // false when none of the users has a subscribed device (permission denied,
  // never granted, unsubscribed). OneSignal still answers 200 in that case.
  delivered: boolean;
}

export const sendPush = async (options: SendPushOptions): Promise<SendPushResult> => {
  if (!isPushConfigured()) throw new Error("OneSignal is not configured");

  const res = await axios.post(
    API_URL,
    {
      app_id: process.env.ONE_SIGNAL_APP_ID,
      target_channel: "push",
      include_aliases: { external_id: options.userIds.map(String) },
      headings: { en: options.title },
      contents: { en: options.body },
      web_url: options.url,
      app_url: options.url,
      data: options.data ?? {},
    },
    {
      headers: {
        Authorization: `Key ${process.env.ONE_SIGNAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 10_000,
    },
  );

  const body = res.data ?? {};
  // OneSignal reports "nobody to send to" as 200 with an errors field and an
  // empty id, not as an HTTP error.
  const id: string | null = body.id || null;
  const errors = body.errors;
  const delivered = Boolean(id) && !(errors && (Array.isArray(errors) ? errors.length : Object.keys(errors).length));
  if (!delivered) {
    logger.info("[Push] No subscribed device for these users", { userIds: options.userIds, errors });
  }
  return { id, delivered };
};

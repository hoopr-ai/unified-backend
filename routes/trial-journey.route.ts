import { Router, type Request, type Response } from "express";
import { unsubscribeFromJourneyService } from "../services/business-service/trial/trial-journey.service";
import { AppError } from "../services/helper-service/modules.export";
import { logger } from "../services/helper-service/logger";

const router = Router();

const page = (title: string, message: string) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title></head>
<body style="margin:0; font-family: Arial, Helvetica, sans-serif; background:#f4f4f4;">
  <div style="max-width:480px; margin:60px auto; background:#fff; border-radius:8px; padding:32px 24px; text-align:center;">
    <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:140px;" />
    <h1 style="font-size:22px; color:#1a1a1a;">${title}</h1>
    <p style="font-size:15px; color:#333; line-height:1.6;">${message}</p>
  </div>
</body></html>`;

// GET /trial-journey/unsubscribe?token=… — the link in every trial journey
// email. Public: the signed token is the proof. Answers with a plain page,
// since it is opened straight from the mail client.
router.get("/unsubscribe", async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  try {
    await unsubscribeFromJourneyService(token);
    res
      .status(200)
      .type("html")
      .send(page("You're unsubscribed", "You won't receive any more marketing emails from Hoopr Smash. Account emails like login codes still reach you."));
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 500;
    if (!(err instanceof AppError)) logger.error("[TrialJourney] Unsubscribe failed", err);
    res
      .status(status)
      .type("html")
      .send(page("Link not valid", "This unsubscribe link is invalid or has expired. Write to hello@hoopr.ai and we'll take you off the list."));
  }
});

export default router;

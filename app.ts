import "dotenv/config";
import "newrelic";
import express from "express";
import type { Application, Request, Response } from "express";
import cors from "cors";
import { getCorsOptions } from "./services/helper-service/cors.config";
import cookieParser from "cookie-parser";
import userRoutes from "./routes/user.route";
import filterRoutes from "./routes/filter.route";
import trackRoutes from "./routes/track.route";
import playlistRoutes from "./routes/playlist.route";
import organizationRoutes from "./routes/organization.route";
import licensesRoutes from "./routes/licenses.route";
import licenseTypeRoutes from "./routes/licenseType.route";
import tokenRoutes from "./routes/token.route";
import likedTrackRoutes from "./routes/liked-track.route";
import streamHistoryRoutes from "./routes/stream-history.route";
import ownerRoutes from "./routes/owner.route";
import occasionRoutes from "./routes/occasion.route";
import quickAddRoutes from "./routes/quick-add.route";
import webBannerRoutes from "./routes/web-banner.route";
import albumRoutes from "./routes/album.route";
import featuredTracksRoutes from "./routes/featured-tracks.route";
import faqRoutes from "./routes/faq.route";
import faqSectionRoutes from "./routes/faq-section.route";
import contactRoutes from "./routes/contact.route";
import companyLookupRoutes from "./routes/company-lookup.route";
import railRoutes from "./routes/rail.route";
import adminInternalUsersRoutes from "./routes/admin-internal-users.route";
import adminSkuRoutes from "./routes/admin-sku.route";
import adminOwnerRoutes from "./routes/admin-owner.route";
import adminArtistRoutes from "./routes/admin-artist.route";
import adminPayPerTrackRoutes from "./routes/admin-pay-per-track.route";
import adminEnterpriseAnalyticsRoutes from "./routes/admin-enterprise-analytics.route";
import adminNativeAnalyticsRoutes from "./routes/admin-native-analytics.route";
import internalLoginRoutes from "./routes/internal-login.route";
import userAddressRoutes from "./routes/user-address.route";
import geographyRoutes from "./routes/geography.route";
import cartRoutes from "./routes/cart.route";
import transactionRoutes from "./routes/transaction.route";
import journeyRoutes from "./routes/journey.route";
import urlMonitorRoutes from "./routes/url-monitor.route";
import adminWhitelistingRoutes from "./routes/admin-whitelisting.route";
import {
  emailCampaignRouter,
  emailTemplateRouter,
  emailSuppressionRouter,
  sesWebhookRouter,
} from "./routes/email-campaign.route";
import { initializeBusinessService } from "./services/business-service/initialize.business.service";
import { errorHandler } from "./middlewares/errorHandler";
import { activityLoggerMiddleware } from "./services/helper-service/modules.export";

const app: Application = express();

// CORS must be the very first middleware
const corsOptions = getCorsOptions();
app.options("/{*splat}", cors(corsOptions));
app.use(cors(corsOptions));

// Keep the raw request bytes — Razorpay webhook signatures are HMACs over the
// exact raw body, so re-serialized JSON would not verify.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use(cookieParser());

await initializeBusinessService();

app.use(activityLoggerMiddleware());

// Mount the more-specific /user/internal-login BEFORE /user so Express resolves it
// directly and never falls through userRoutes. Defence-in-depth — userRoutes has no
// catch-all today, but a future addition there must not silently shadow login OTP.
app.use("/user/internal-login", internalLoginRoutes);
app.use("/user/address", userAddressRoutes);
app.use("/", geographyRoutes);
app.use("/user", userRoutes);
app.use("/filters", filterRoutes);
app.use("/tracks", trackRoutes);
app.use("/playlists", playlistRoutes);
app.use("/organizations", organizationRoutes);
app.use("/licenses", licensesRoutes);
app.use("/license-types", licenseTypeRoutes);
app.use("/tokens", tokenRoutes);
app.use("/liked-tracks", likedTrackRoutes);
app.use("/stream-history", streamHistoryRoutes);
app.use("/owners", ownerRoutes);
app.use("/occasions", occasionRoutes);
app.use("/quick-adds", quickAddRoutes);
app.use("/web-banners", webBannerRoutes);
app.use("/albums", albumRoutes);
app.use("/featured-tracks", featuredTracksRoutes);
app.use("/faqs", faqRoutes);
app.use("/faq-sections", faqSectionRoutes);
app.use("/contact", contactRoutes);
app.use("/company-lookup", companyLookupRoutes);
app.use("/rails", railRoutes);
app.use("/admin/internal-users", adminInternalUsersRoutes);
app.use("/admin/skus", adminSkuRoutes);
app.use("/admin/owners", adminOwnerRoutes);
app.use("/admin/artists", adminArtistRoutes);
app.use("/admin/pay-per-track", adminPayPerTrackRoutes);
app.use("/admin/enterprise-analytics", adminEnterpriseAnalyticsRoutes);
// Session/event analytics over the data NATIVE-BE records for creator-web and
// creator-mobile (same shared DB, so no service hop).
app.use("/admin/native-analytics", adminNativeAnalyticsRoutes);
app.use("/admin/url-monitor", urlMonitorRoutes);
// Channel Whitelisting — the ops CMS over creators' submitted channels and
// their claim-clearance requests. Reads soundtracking_user_profiles (written by
// content-recommendation + NATIVE-BE) and claims (owned by NATIVE-BE) on the
// same shared DB, so no service hop; this service already owns the internal
// sessions and functionality grants the routes are gated by.
app.use("/admin/whitelisting", adminWhitelistingRoutes);
app.use("/cart", cartRoutes);
app.use("/transaction", transactionRoutes);
app.use("/journey", journeyRoutes);
app.use("/admin/email-campaigns", emailCampaignRouter);
app.use("/admin/email-templates", emailTemplateRouter);
app.use("/admin/email-suppressions", emailSuppressionRouter);
app.use("/webhooks/ses", sesWebhookRouter);

app.get("/health-check", (req: Request, res: Response) => {
  res.status(200).send(`Hoopr Sage ${process.env.NODE_ENV} Server is Healthy`);
});

app.use(errorHandler);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});

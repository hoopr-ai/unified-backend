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
import { initializeBusinessService } from "./services/business-service/initialize.business.service";
import { errorHandler } from "./middlewares/errorHandler";
import { activityLoggerMiddleware } from "./services/helper-service/modules.export";

const app: Application = express();

// CORS must be the very first middleware
const corsOptions = getCorsOptions();
app.options("/{*splat}", cors(corsOptions));
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

await initializeBusinessService();

app.use(activityLoggerMiddleware());

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

app.get("/health-check", (req: Request, res: Response) => {
  res.status(200).send(`Hoopr Sage ${process.env.NODE_ENV} Server is Healthy`);
});

app.use(errorHandler);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});

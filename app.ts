import dotenv from "dotenv";
import express from "express";
import type { Application } from "express";
import cors from "cors";
import type { CorsOptions } from "cors";
import type { Request, Response } from "express";
import userRoutes from "./routes/user.route";
import filterRoutes from "./routes/filter.route";
import trackRoutes from "./routes/track.route";
import { initializeBusinessService } from "./services/business-service/initialize.business.service";
import { errorHandler } from "./middlewares/errorHandler";

dotenv.config();
const app: Application = express();
app.use(express.json());

await initializeBusinessService();

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, mobile apps, etc.)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins: string[] = [
        process.env.FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:5173/",
        "http://localhost:3002",
        "http://localhost:3000",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5174",
        "https://dev-sage.hoopr.ai",
        "https://dev-sage-api.hoopr.ai",
        "https://sage-api.hoopr.ai",
    ].filter((origin): origin is string => Boolean(origin));

    // Allow localhost with any port for development
    if (
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers",
  ],
  exposedHeaders: ["Set-Cookie"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Enable preflight for all routes
app.options(/.*/, cors(corsOptions));

// User Routes
app.use("/user", userRoutes);

// Filter Routes
app.use("/filters", filterRoutes);

// Track Routes
app.use("/tracks", trackRoutes);

app.get("/health-check", (req: Request, res: Response) => {
  res
    .status(200)
    .send(`Hoopr Sage ${process.env.NODE_ENV} Server is Healthy`);
});

app.use(errorHandler);
const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});

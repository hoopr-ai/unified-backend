import { Sequelize } from "sequelize-typescript";
import { config } from "dotenv";
import { UserModel, UserRoleModel } from "./user/modules.export";
import { TrackModel } from "./track/modules.export";

config();

// Validate required env variables
const requiredEnv = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
});

// STRONGLY TYPE THEM AS STRING (fixes TypeScript)
const DB_HOST = process.env.DB_HOST as string;
const DB_PORT = Number(process.env.DB_PORT);
const DB_USER = process.env.DB_USER as string;
const DB_PASSWORD = process.env.DB_PASSWORD as string;
const DB_NAME = process.env.DB_NAME as string;

const isProduction = process.env.NODE_ENV == "production";

export const sequelize = new Sequelize({
  dialect: "postgres",
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  logging: process.env.DB_LOGGING === "true",

  dialectOptions: isProduction
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {},

  define: {
    freezeTableName: true,
    timestamps: true,
  },
});

// Auto-load models
sequelize.addModels([
  UserModel,
  UserRoleModel,
  TrackModel,
]);

export async function connectDatabase() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected.");

    if (process.env.DB_SYNC == "true") {
      await sequelize.sync({ alter: true });
      console.log("📦 Models synchronized.");
    }
  } catch (err) {
    console.error("❌ Database connection error:", err);
    process.exit(1);
  }
}
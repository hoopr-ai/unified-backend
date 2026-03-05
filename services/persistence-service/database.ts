import { Sequelize } from "sequelize-typescript";
import { config } from "dotenv";
import {
  UserModel,
  UserRoleModel,
  UserSessionModel,
  UserActivityModel,
  UserLikedTrackModel,
  UserStreamHistoryModel,
} from "./user/modules.export";
import { TrackModel } from "./track/modules.export";
import { AlbumModel } from "./albums/modules.export";
import { FilterModel, TrackFilterMappingModel } from "./filter/modules.export";
import { ArtistModel, TrackArtistMappingModel } from "./artists/modules.export";
import {
  PlaylistModel,
  TrackPlaylistMappingModel,
} from "./playlists/modules.export";
import { OrganizationModel } from "./organization/modules.export";
import { BrandModel } from "./brand/modules.export";
import {
  LicenseModel,
  LicenseTypeModel,
  VideoLinkModel,
} from "./licenses/modules.export";
import { SkuModel } from "./sku/modules.export";
import { OwnerModel } from "./owner/modules.export";
import { TokenModel } from "./token/modules.export";

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

  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },

  define: {
    freezeTableName: true,
    timestamps: true,
  },
});

// Auto-load models
sequelize.addModels([
  OrganizationModel,
  BrandModel,
  UserModel,
  UserRoleModel,
  UserSessionModel,
  UserActivityModel,
  UserLikedTrackModel,
  UserStreamHistoryModel,
  TrackModel,
  AlbumModel,
  FilterModel,
  TrackFilterMappingModel,
  ArtistModel,
  TrackArtistMappingModel,
  PlaylistModel,
  TrackPlaylistMappingModel,
  LicenseTypeModel,
  LicenseModel,
  SkuModel,
  OwnerModel,
  VideoLinkModel,
  TokenModel,
]);

// Idempotent SQL: ensures all triggers + functions exist without dropping anything
// Safe for shared DB — Python backend's triggers/columns are never disrupted
const ENSURE_TRIGGERS_SQL = `
  -- FUNCTION 1: Auto-create brands_info row when new brand is added
  CREATE OR REPLACE FUNCTION create_brands_info_on_new_brand()
  RETURNS TRIGGER AS $$
  BEGIN
      INSERT INTO brands_info (brand_id, brand_name, description)
      VALUES (NEW.id, NEW.name, NEW.description)
      ON CONFLICT (brand_id) DO NOTHING;
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_create_brands_info'
    ) THEN
      CREATE TRIGGER trigger_create_brands_info
      AFTER INSERT ON brands
      FOR EACH ROW EXECUTE PROCEDURE create_brands_info_on_new_brand();
    END IF;
  END $$;

  -- FUNCTION 2: Sync name/description changes from brands to brands_info
  CREATE OR REPLACE FUNCTION sync_brands_info()
  RETURNS TRIGGER AS $$
  BEGIN
      UPDATE brands_info
      SET brand_name  = NEW.name,
          description = NEW.description
      WHERE brand_id = NEW.id;
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_sync_brands_info'
    ) THEN
      CREATE TRIGGER trigger_sync_brands_info
      AFTER UPDATE OF name, description ON brands
      FOR EACH ROW EXECUTE PROCEDURE sync_brands_info();
    END IF;
  END $$;

  -- FUNCTION 3: pg_notify when a new brands_info row is inserted
  CREATE OR REPLACE FUNCTION notify_brand_profile_needed()
  RETURNS TRIGGER AS $$
  BEGIN
      PERFORM pg_notify('brand_profile_needed', NEW.brand_id::text);
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_notify_brand_profile_insert'
    ) THEN
      CREATE TRIGGER trigger_notify_brand_profile_insert
      AFTER INSERT ON brands_info
      FOR EACH ROW EXECUTE PROCEDURE notify_brand_profile_needed();
    END IF;
  END $$;

  -- TRIGGER 4: pg_notify when insta_username or industry is updated
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_notify_brand_profile_update'
    ) THEN
      CREATE TRIGGER trigger_notify_brand_profile_update
      AFTER UPDATE OF insta_username, industry ON brands_info
      FOR EACH ROW EXECUTE PROCEDURE notify_brand_profile_needed();
    END IF;
  END $$;
`;

export async function connectDatabase() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected.");
  } catch (err) {
    console.error("❌ Database connection error:", err);
    process.exit(1);
  }

  if (process.env.DB_SYNC == "true") {
    try {
      // 1. Create-only sync: creates missing tables/columns, never drops anything
      //    Safe for shared DB — won't touch columns managed by Python (e.g. embedding)
      await sequelize.sync({ force: false, alter: false });
      console.log("📦 Models synchronized (create-only).");

      // 2. Ensure pgvector extension exists (needed by Python backend)
      await sequelize.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

      // 3. Add columns that Sequelize can't manage (pgvector types)
      //    These are idempotent — safe to run every startup
      await sequelize.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'brands_info' AND column_name = 'embedding'
          ) THEN
            ALTER TABLE brands_info ADD COLUMN embedding vector;
          END IF;
        END $$;
      `);
      console.log("📦 Python-managed columns ensured.");

      // 4. Ensure triggers + functions exist (idempotent — CREATE OR REPLACE / IF NOT EXISTS)
      await sequelize.query(ENSURE_TRIGGERS_SQL);
      console.log("🔁 Triggers ensured.");
    } catch (err) {
      console.error("❌ Database sync error:", (err as Error).message);
    }
  }
}

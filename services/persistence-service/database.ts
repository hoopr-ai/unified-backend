import { Sequelize } from "sequelize-typescript";
import { config } from "dotenv";
import {
  UserModel,
  UserRoleModel,
  UserSessionModel,
  UserActivityModel,
  UserLikedTrackModel,
  UserStreamHistoryModel,
  UserProfileModel,
  UserAddressModel,
  UserEntityDetailsModel,
  AccessRequestModel,
} from "./user/modules.export";
import { TrackModel, FeaturedTracksModel, ChartTrackModel } from "./track/modules.export";
import { AlbumModel } from "./albums/modules.export";
import {
  FilterModel,
  TrackFilterMappingModel,
  SubFilterModel,
  TrackSubFilterMappingModel,
} from "./filter/modules.export";
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
import { TokenModel, TokenHistoryModel, TokenAssignedModel, TokenDeductionModel } from "./token/modules.export";
import { OccasionModel, TrackOccasionMappingModel } from "./occasion/modules.export";
import { QuickAddModel } from "./quick-add/modules.export";
import { WebBannerModel } from "./web-banner/modules.export";
import { CampaignModel } from "./campaign/modules.export";
import { FaqModel, FaqSectionModel } from "./faq/modules.export";
import {
  KeywordModel,
  TrackKeywordMappingModel,
} from "./keyword/modules.export";
import { RailModel, RailItemModel } from "./rail/modules.export";
import { CountryModel, StateModel, CityModel } from "./geography/modules.export";
import { CartModel } from "./cart/modules.export";
import { OrderModel, OrderInfoModel } from "./order/modules.export";
import { TransactionModel } from "./transaction/modules.export";
import { WebhookLogModel } from "./webhook/modules.export";
import {
  EmailCampaignModel,
  EmailCampaignRecipientModel,
  EmailTemplateModel,
  EmailSuppressionModel,
  EmailEventModel,
} from "./email-campaign/schemas/modules.export";
import {
  MonitoredUrlModel,
  MonitorCheckModel,
} from "./url-monitor/schemas/modules.export";

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
    // Never let a single slow query hold a pooled connection forever — Postgres
    // kills it server-side and the connection returns to the pool.
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
  },

  // Sequelize defaults to max:5 / acquire:60000. Five connections cannot serve a
  // page that fans out to a dozen concurrent rail/token calls: requests queue,
  // block for the full 60s acquire window, then 500 — and nginx's 60s
  // proxy_read_timeout returns its own 504 with no CORS headers, which the
  // browser reports as a CORS failure. Raise the pool and fail fast instead.
  pool: {
    max: Number(process.env.DB_POOL_MAX) || 25,
    min: Number(process.env.DB_POOL_MIN) || 2,
    acquire: Number(process.env.DB_POOL_ACQUIRE) || 15000,
    idle: 10000,
    evict: 10000,
  },

  retry: { max: 2 },

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
  UserProfileModel,
  UserAddressModel,
  UserEntityDetailsModel,
  AccessRequestModel,
  TrackModel,
  AlbumModel,
  FilterModel,
  TrackFilterMappingModel,
  SubFilterModel,
  TrackSubFilterMappingModel,
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
  TokenHistoryModel,
  TokenAssignedModel,
  TokenDeductionModel,
  OccasionModel,
  TrackOccasionMappingModel,
  QuickAddModel,
  WebBannerModel,
  FeaturedTracksModel,
  ChartTrackModel,
  KeywordModel,
  TrackKeywordMappingModel,
  CampaignModel,
  FaqSectionModel,
  FaqModel,
  RailModel,
  RailItemModel,
  CountryModel,
  StateModel,
  CityModel,
  CartModel,
  OrderModel,
  OrderInfoModel,
  TransactionModel,
  WebhookLogModel,
  EmailCampaignModel,
  EmailCampaignRecipientModel,
  EmailTemplateModel,
  EmailSuppressionModel,
  EmailEventModel,
  MonitoredUrlModel,
  MonitorCheckModel,
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

  -- FUNCTION 5: Record token_history on every INSERT or UPDATE to tokens (including deductions)
  CREATE OR REPLACE FUNCTION record_token_history()
  RETURNS TRIGGER AS $$
  DECLARE
    assigned INT;
  BEGIN
    IF TG_OP = 'INSERT' THEN
      assigned := NEW."totalAssignedToken";
    ELSE
      assigned := NEW."totalAssignedToken" - OLD."totalAssignedToken";
    END IF;

    -- Record both positive (additions) and negative (deductions) changes
    IF assigned != 0 THEN
      INSERT INTO token_history ("tokenId", "brandId", "type", "assignedAmount", "expiryDate", "createdAt", "updatedAt")
      VALUES (NEW.id, NEW."brandId", NEW.type, assigned, NEW."expiryDate", NOW(), NOW());
    END IF;

    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_record_token_history'
    ) THEN
      CREATE TRIGGER trigger_record_token_history
      AFTER INSERT OR UPDATE OF "totalAssignedToken" ON tokens
      FOR EACH ROW EXECUTE PROCEDURE record_token_history();
    END IF;
  END $$;

  -- FUNCTION 6: Record token_history when token entry is DELETED
  CREATE OR REPLACE FUNCTION record_token_history_on_delete()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Record the deletion as negative of remaining totalAssignedToken
    IF OLD."totalAssignedToken" != 0 THEN
      INSERT INTO token_history ("tokenId", "brandId", "type", "assignedAmount", "expiryDate", "createdAt", "updatedAt")
      VALUES (OLD.id, OLD."brandId", OLD.type, -OLD."totalAssignedToken", OLD."expiryDate", NOW(), NOW());
    END IF;

    RETURN OLD;
  END;
  $$ LANGUAGE plpgsql;

  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_record_token_history_delete'
    ) THEN
      CREATE TRIGGER trigger_record_token_history_delete
      BEFORE DELETE ON tokens
      FOR EACH ROW EXECUTE PROCEDURE record_token_history_on_delete();
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

      // 3b. Idempotently add users.lastLoginAt (used only by INTERNAL admin CMS list view).
      // Nullable + no default — non-INTERNAL flows never read or write it.
      await sequelize.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'lastLoginAt'
          ) THEN
            ALTER TABLE users ADD COLUMN "lastLoginAt" TIMESTAMP WITH TIME ZONE NULL;
          END IF;
        END $$;
      `);
      console.log("📦 users.lastLoginAt ensured.");

      // 3c. Idempotently add playlists.imageLink (cover artwork URL set by the
      // internal Playlist CMS upload flow). Nullable — playlists without an
      // uploaded cover fall back to the CDN-by-code convention on the client.
      await sequelize.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'playlists' AND column_name = 'imageLink'
          ) THEN
            ALTER TABLE playlists ADD COLUMN "imageLink" VARCHAR(1024) NULL;
          END IF;
        END $$;
      `);
      console.log("📦 playlists.imageLink ensured.");

      // 3d. Idempotently add rails.populateMode (App Home CMS + the
      // Content-Recommendation app endpoint read it: 'MANUAL' = serve only the
      // curated rail_items, 'AUTO' = auto-fill from the catalogue). Nullable —
      // legacy rails with NULL are treated as MANUAL. Required because rail
      // reads SELECT every mapped column; without it, GET /rails would error on
      // a DB that doesn't already have the column.
      await sequelize.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'rails' AND column_name = 'populateMode'
          ) THEN
            ALTER TABLE rails ADD COLUMN "populateMode" VARCHAR(50) NULL;
          END IF;
        END $$;
      `);
      console.log("📦 rails.populateMode ensured.");

      // 4. Ensure triggers + functions exist (idempotent — CREATE OR REPLACE / IF NOT EXISTS)
      await sequelize.query(ENSURE_TRIGGERS_SQL);
      console.log("🔁 Triggers ensured.");
    } catch (err) {
      console.error("❌ Database sync error:", (err as Error).message);
    }
  }
}

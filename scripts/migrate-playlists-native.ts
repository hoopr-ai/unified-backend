import { Client } from "pg";
import { Sequelize } from "sequelize-typescript";
import { PlaylistModel, TrackPlaylistMappingModel } from "../services/persistence-service/playlists/modules.export";
import { TrackModel, FeaturedTracksModel, ChartTrackModel } from "../services/persistence-service/track/modules.export";
import { AlbumModel } from "../services/persistence-service/albums/modules.export";
import { FilterModel, TrackFilterMappingModel } from "../services/persistence-service/filter/modules.export";
import { ArtistModel, TrackArtistMappingModel } from "../services/persistence-service/artists/modules.export";
import { OrganizationModel } from "../services/persistence-service/organization/modules.export";
import { BrandModel } from "../services/persistence-service/brand/modules.export";
import { LicenseModel, LicenseTypeModel, VideoLinkModel } from "../services/persistence-service/licenses/modules.export";
import { SkuModel } from "../services/persistence-service/sku/modules.export";
import { OwnerModel } from "../services/persistence-service/owner/modules.export";
import { TokenModel, TokenHistoryModel, TokenAssignedModel, TokenDeductionModel } from "../services/persistence-service/token/modules.export";
import { OccasionModel } from "../services/persistence-service/occasion/modules.export";
import { CampaignModel } from "../services/persistence-service/campaign/modules.export";
import { FaqModel, FaqSectionModel } from "../services/persistence-service/faq/modules.export";
import { KeywordModel, TrackKeywordMappingModel } from "../services/persistence-service/keyword/modules.export";
import { RailModel, RailItemModel } from "../services/persistence-service/rail/modules.export";
import { CountryModel, StateModel, CityModel } from "../services/persistence-service/geography/modules.export";
import { CartModel } from "../services/persistence-service/cart/modules.export";
import { OrderModel, OrderInfoModel } from "../services/persistence-service/order/modules.export";
import { TransactionModel } from "../services/persistence-service/transaction/modules.export";
import { UserModel, UserRoleModel, UserSessionModel, UserActivityModel, UserLikedTrackModel, UserStreamHistoryModel, UserProfileModel, UserAddressModel } from "../services/persistence-service/user/modules.export";
import { PlaylistType } from "../services/dto-service/playlists/playlist.enum";

// ============ SOURCE DATABASE (select_staging) ============
const SOURCE_DB_CONFIG = {
  host: "34.47.193.1",
  port: 5432,
  user: "hoopr-server",
  password: "Sz6J8J77X2VFuHd9GzR3",
  database: "production",
};

// ============ TARGET DATABASE (unified_staging) ============
const TARGET_DB_CONFIG = {
  // host: "34.47.200.207",
  // username: "select-server-dev",
  // password: "hO82GcLotttB5bLyoeG1",
  // database: "sage_staging",
  port: 5432,
  host: "34.47.153.109",
  username: "unified-prod",
  password: 'X"E6o+`{yvN|c30R',
  database: "unified-backend-prod",
  ssl: { rejectUnauthorized: false },
};

// Fields that exist in PlaylistModel (from playlist.schema.ts)
const PLAYLIST_MODEL_FIELDS = [
  "id",
  "playlistCode",
  "name",
  "description",
  "type",
  "playlistType",
  "name_slug",
  "partnerId",
  "status",
  "createdAt",
  "updatedAt",
] as const;

// Fields that need uppercase conversion
const UPPERCASE_FIELDS = ["type", "playlistType"];

function mapSourcePlaylistToModel(sourcePlaylist: any): Partial<PlaylistModel> {
  const mappedPlaylist: Record<string, any> = {};

  for (const field of PLAYLIST_MODEL_FIELDS) {
    const sourceValue = sourcePlaylist[field];

    // Skip if field doesn't exist in source
    if (sourceValue === undefined) {
      continue;
    }

    // Handle uppercase fields (type, playlistType)
    if (UPPERCASE_FIELDS.includes(field) && sourceValue) {
      mappedPlaylist[field] = String(sourceValue).toUpperCase();
      continue;
    }

    // Pass through other fields
    mappedPlaylist[field] = sourceValue;
  }

  // Always set status to ACTIVE (uppercase)
  mappedPlaylist["status"] = "ACTIVE";

  // // Default playlistType to SYSTEM if not present in source
  // if (mappedPlaylist.type) {
  //   mappedPlaylist.type = PlaylistType.SYSTEM;
  // }

  // mappedPlaylist.playlistType = "PLAYLIST";

  return mappedPlaylist as Partial<PlaylistModel>;
}

async function migratePlaylists() {
  const sourceClient = new Client(SOURCE_DB_CONFIG);

  // Create Sequelize instance for target database
  const targetSequelize = new Sequelize({
    dialect: "postgres",
    host: TARGET_DB_CONFIG.host,
    port: TARGET_DB_CONFIG.port,
    username: TARGET_DB_CONFIG.username,
    password: TARGET_DB_CONFIG.password,
    database: TARGET_DB_CONFIG.database,
    logging: false,
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

  // Register all models so associations resolve correctly
  targetSequelize.addModels([
    OrganizationModel, BrandModel,
    UserModel, UserRoleModel, UserSessionModel, UserActivityModel,
    UserLikedTrackModel, UserStreamHistoryModel, UserProfileModel, UserAddressModel,
    TrackModel, AlbumModel, FilterModel, TrackFilterMappingModel,
    ArtistModel, TrackArtistMappingModel, PlaylistModel, TrackPlaylistMappingModel,
    LicenseTypeModel, LicenseModel, SkuModel, OwnerModel, VideoLinkModel,
    TokenModel, TokenHistoryModel, TokenAssignedModel, TokenDeductionModel,
    OccasionModel, FeaturedTracksModel, ChartTrackModel,
    KeywordModel, TrackKeywordMappingModel, CampaignModel,
    FaqSectionModel, FaqModel, RailModel, RailItemModel,
    CountryModel, StateModel, CityModel, CartModel,
    OrderModel, OrderInfoModel, TransactionModel,
  ]);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database (select_staging)");

    await targetSequelize.authenticate();
    console.log("✅ Connected to target database (unified_staging)");

    // Fetch only EDITORIAL playlists from source
    const { rows: playlists } = await sourceClient.query(
      `SELECT * FROM playlists WHERE type = 'editorial'`,
    );
    console.log(`📦 Found ${playlists.length} playlists to migrate`);

    if (playlists.length === 0) {
      console.log("No playlists to migrate");
      return;
    }

    // Log fields that will be skipped
    if (playlists.length > 0) {
      const sourceFields = Object.keys(playlists[0]);
      const skippedFields = sourceFields.filter(
        (f) => !PLAYLIST_MODEL_FIELDS.includes(f as any),
      );
      if (skippedFields.length > 0) {
        console.log(
          `⚠️  Skipping fields not in PlaylistModel: ${skippedFields.join(", ")}`,
        );
      }
    }

    let successCount = 0;
    let errorCount = 0;

    for (const playlist of playlists) {
      try {
        const mappedPlaylist = mapSourcePlaylistToModel(playlist);

        // Ensure id is present for upsert
        if (!mappedPlaylist.id) {
          console.warn(`⚠️  Skipping playlist with missing id`);
          continue;
        }

        // Use upsert to handle conflicts on id
        await PlaylistModel.upsert(mappedPlaylist as any, {
          conflictFields: ["id"],
        });

        successCount++;

        if (successCount % 100 === 0) {
          console.log(`⏳ Migrated ${successCount} playlists...`);
        }
      } catch (err: any) {
        errorCount++;
        console.error(
          `❌ Error migrating playlist ${playlist.id}:`,
          err.message,
        );
      }
    }

    console.log(
      `\n✅ Migration complete: ${successCount} succeeded, ${errorCount} failed`,
    );

    // ── Fix playlistCodes: assign sequential P-format codes to EDITORIAL
    //    playlists whose code is a bare number (1, 2, 3…) or NULL
    console.log("\n🔧 Fixing playlistCodes for EDITORIAL playlists...");

    // Find current max numeric playlistCode across ALL playlists in target
    const [maxRows] = await targetSequelize.query(
      `SELECT MAX("playlistCode"::int) AS max FROM playlists
       WHERE "playlistCode" ~ '^[0-9]+$'`,
    ) as [Array<{ max: number | null }>, unknown];

    let nextNum = maxRows[0]?.max != null ? maxRows[0].max + 1 : 1;

    // Get EDITORIAL playlists with non-numeric codes or NULL, ordered by createdAt
    const [toFix] = await targetSequelize.query(
      `SELECT id FROM playlists
       WHERE type = 'EDITORIAL'
         AND ("playlistCode" IS NULL OR "playlistCode" !~ '^[0-9]+$')
       ORDER BY "createdAt" ASC`,
    ) as [Array<{ id: string }>, unknown];

    console.log(`📋 ${toFix.length} playlists need a new playlistCode`);

    let fixCount = 0;
    for (const row of toFix) {
      await targetSequelize.query(
        `UPDATE playlists SET "playlistCode" = :code WHERE id = :id`,
        { replacements: { code: String(nextNum), id: row.id } },
      );
      nextNum++;
      fixCount++;
    }

    console.log(`✅ Reassigned ${fixCount} playlistCodes (next would be ${nextNum})`);
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await sourceClient.end();
    await targetSequelize.close();
  }
}

migratePlaylists();

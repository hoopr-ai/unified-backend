import { Client } from "pg";
import { Sequelize } from "sequelize-typescript";
import {
  FilterModel,
  TrackFilterMappingModel,
} from "../services/persistence-service/filter/modules.export";
import { TrackModel } from "../services/persistence-service/track/modules.export";

// ============ SOURCE DATABASE (select_staging) ============
const SOURCE_DB_CONFIG = {
  host: "34.100.172.44",
  port: 5432,
  user: "s-prod",
  password: "ROUG2gact4whif_oorn",
  database: "S-PROD",
};

// ============ TARGET DATABASE (unified_staging) ============
const TARGET_DB_CONFIG = {
  host: "34.47.200.207",
  port: 5432,
  username: "select-server-dev",
  password: "hO82GcLotttB5bLyoeG1",
  database: "sage_staging",
};

// Fields that exist in FilterModel (from filter.schema.ts)
const FILTER_MODEL_FIELDS = [
  "id",
  "name",
  "status",
  "type",
  "createdAt",
  "updatedAt",
] as const;

// Fields that exist in TrackFilterMappingModel (from track-filter-mapping.schema.ts)
const TRACK_FILTER_MAPPING_MODEL_FIELDS = ["id", "filterId", "trackId"] as const;

function mapSourceFilterToModel(sourceFilter: any): Partial<FilterModel> {
  const mappedFilter: Record<string, any> = {};

  for (const field of FILTER_MODEL_FIELDS) {
    const sourceValue = sourceFilter[field];

    // Skip if field doesn't exist in source
    if (sourceValue === undefined) {
      continue;
    }

    // Pass through other fields
    mappedFilter[field] = sourceValue;
  }

  return mappedFilter as Partial<FilterModel>;
}

function mapSourceTrackFilterMappingToModel(
  sourceMapping: any
): Partial<TrackFilterMappingModel> {
  const mappedMapping: Record<string, any> = {};

  for (const field of TRACK_FILTER_MAPPING_MODEL_FIELDS) {
    const sourceValue = sourceMapping[field];

    // Skip if field doesn't exist in source
    if (sourceValue === undefined) {
      continue;
    }

    // Pass through other fields
    mappedMapping[field] = sourceValue;
  }

  return mappedMapping as Partial<TrackFilterMappingModel>;
}

async function migrateFilters() {
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
    define: {
      freezeTableName: true,
      timestamps: true,
    },
  });

  // Register models with this Sequelize instance
  targetSequelize.addModels([FilterModel, TrackFilterMappingModel, TrackModel]);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database (select_staging)");

    await targetSequelize.authenticate();
    console.log("✅ Connected to target database (unified_staging)");

    // ============ MIGRATE FILTERS ============
    console.log("\n📦 Starting filters migration...");

    const { rows: filters } = await sourceClient.query(`SELECT * FROM filters`);
    console.log(`📦 Found ${filters.length} filters to migrate`);

    if (filters.length > 0) {
      // Log fields that will be skipped
      const sourceFields = Object.keys(filters[0]);
      const skippedFields = sourceFields.filter(
        (f) => !FILTER_MODEL_FIELDS.includes(f as any)
      );
      if (skippedFields.length > 0) {
        console.log(
          `⚠️  Skipping fields not in FilterModel: ${skippedFields.join(", ")}`
        );
      }

      let filterSuccessCount = 0;
      let filterErrorCount = 0;

      for (const filter of filters) {
        try {
          const mappedFilter = mapSourceFilterToModel(filter);

          // Ensure id is present for upsert
          if (!mappedFilter.id) {
            console.warn(`⚠️  Skipping filter with missing id`);
            continue;
          }

          // Use upsert to handle conflicts on id
          await FilterModel.upsert(mappedFilter as any, {
            conflictFields: ["id"],
          });

          filterSuccessCount++;

          if (filterSuccessCount % 100 === 0) {
            console.log(`⏳ Migrated ${filterSuccessCount} filters...`);
          }
        } catch (err: any) {
          filterErrorCount++;
          console.error(`❌ Error migrating filter ${filter.id}:`, err.message);
        }
      }

      console.log(
        `✅ Filters migration complete: ${filterSuccessCount} succeeded, ${filterErrorCount} failed`
      );
    }

    // ============ MIGRATE TRACK FILTER MAPPINGS ============
    console.log("\n📦 Starting track_filter_mappings migration...");

    const { rows: mappings } = await sourceClient.query(
      `SELECT * FROM track_filter_mappings`
    );
    console.log(`📦 Found ${mappings.length} track_filter_mappings to migrate`);

    if (mappings.length > 0) {
      // Log fields that will be skipped
      const sourceFields = Object.keys(mappings[0]);
      const skippedFields = sourceFields.filter(
        (f) => !TRACK_FILTER_MAPPING_MODEL_FIELDS.includes(f as any)
      );
      if (skippedFields.length > 0) {
        console.log(
          `⚠️  Skipping fields not in TrackFilterMappingModel: ${skippedFields.join(", ")}`
        );
      }

      let mappingSuccessCount = 0;
      let mappingErrorCount = 0;

      for (const mapping of mappings) {
        try {
          const mappedMapping = mapSourceTrackFilterMappingToModel(mapping);

          // Ensure id is present for upsert
          if (!mappedMapping.id) {
            console.warn(`⚠️  Skipping mapping with missing id`);
            continue;
          }

          // Use upsert to handle conflicts on id
          await TrackFilterMappingModel.upsert(mappedMapping as any, {
            conflictFields: ["id"],
          });

          mappingSuccessCount++;

          if (mappingSuccessCount % 100 === 0) {
            console.log(
              `⏳ Migrated ${mappingSuccessCount} track_filter_mappings...`
            );
          }
        } catch (err: any) {
          mappingErrorCount++;
          console.error(
            `❌ Error migrating track_filter_mapping ${mapping.id}:`,
            err.message
          );
        }
      }

      console.log(
        `✅ Track filter mappings migration complete: ${mappingSuccessCount} succeeded, ${mappingErrorCount} failed`
      );
    }

    console.log("\n✅ All migrations complete!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await sourceClient.end();
    await targetSequelize.close();
  }
}

migrateFilters();

/**
 * Schema Comparison Script
 * Compares TypeScript Sequelize schema definitions with actual PostgreSQL database schema.
 * Logs differences both ways (code vs DB and DB vs code).
 *
 * Usage: npx tsx scripts/compare-schema.ts
 *
 * NOTE: This script is READ-ONLY and does NOT alter any database schema.
 */

import { Sequelize, ModelAttributeColumnOptions } from "sequelize-typescript";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import all models
import {
  UserModel,
  UserRoleModel,
  UserSessionModel,
  UserActivityModel,
  UserLikedTrackModel,
  UserStreamHistoryModel,
} from "../services/persistence-service/user/modules.export";
import { TrackModel, FeaturedTracksModel } from "../services/persistence-service/track/modules.export";
import { AlbumModel } from "../services/persistence-service/albums/modules.export";
import { FilterModel, TrackFilterMappingModel } from "../services/persistence-service/filter/modules.export";
import { ArtistModel, TrackArtistMappingModel } from "../services/persistence-service/artists/modules.export";
import {
  PlaylistModel,
  TrackPlaylistMappingModel,
} from "../services/persistence-service/playlists/modules.export";
import { OrganizationModel } from "../services/persistence-service/organization/modules.export";
import { BrandModel } from "../services/persistence-service/brand/modules.export";
import {
  LicenseModel,
  LicenseTypeModel,
  VideoLinkModel,
} from "../services/persistence-service/licenses/modules.export";
import { SkuModel } from "../services/persistence-service/sku/modules.export";
import { OwnerModel } from "../services/persistence-service/owner/modules.export";
import { TokenModel, TokenHistoryModel } from "../services/persistence-service/token/modules.export";
import { OccasionModel } from "../services/persistence-service/occasion/modules.export";
import { CampaignModel } from "../services/persistence-service/campaign/modules.export";
import { FaqModel, FaqSectionModel } from "../services/persistence-service/faq/modules.export";
import {
  KeywordModel,
  TrackKeywordMappingModel,
} from "../services/persistence-service/keyword/modules.export";
import {
  SoundProjectModel,
  ProjectVideoModel,
  ProjectTrackModel,
} from "../services/persistence-service/project/modules.export";

config();

// Interface definitions
interface DBColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
  udt_name: string;
}

interface DBTable {
  table_name: string;
}

interface ColumnDiff {
  column: string;
  issue: string;
  codeValue?: string;
  dbValue?: string;
}

interface TableDiff {
  tableName: string;
  columnsOnlyInCode: string[];
  columnsOnlyInDB: string[];
  typeMismatches: ColumnDiff[];
  nullabilityMismatches: ColumnDiff[];
}

interface ComparisonResult {
  timestamp: string;
  tablesOnlyInCode: string[];
  tablesOnlyInDB: string[];
  tableDiffs: TableDiff[];
  summary: {
    totalTablesInCode: number;
    totalTablesInDB: number;
    tablesWithDifferences: number;
    totalColumnDifferences: number;
  };
}

// Map Sequelize DataTypes to PostgreSQL types
function sequelizeToPostgresType(seqType: string): string[] {
  const typeMap: Record<string, string[]> = {
    "BIGINT": ["bigint"],
    "INTEGER": ["integer", "int4"],
    "SMALLINT": ["smallint", "int2"],
    "STRING": ["character varying", "varchar", "text"],
    "TEXT": ["text", "character varying"],
    "BOOLEAN": ["boolean", "bool"],
    "DATE": ["timestamp with time zone", "timestamp without time zone", "timestamptz", "timestamp"],
    "DATEONLY": ["date"],
    "UUID": ["uuid"],
    "JSONB": ["jsonb"],
    "JSON": ["json", "jsonb"],
    "FLOAT": ["double precision", "float8", "real", "float4"],
    "DOUBLE": ["double precision", "float8"],
    "DECIMAL": ["numeric", "decimal"],
    "ARRAY": ["ARRAY"],
    "ENUM": ["USER-DEFINED"],
  };

  return typeMap[seqType] || [seqType.toLowerCase()];
}

// Extract base type from Sequelize type string
function extractBaseType(typeStr: string): { baseType: string; isArray: boolean; length?: number } {
  const str = typeStr.toString();

  // Check for ARRAY type
  if (str.includes("ARRAY")) {
    return { baseType: "ARRAY", isArray: true };
  }

  // Extract type with possible length, e.g., "STRING(255)" -> "STRING", length: 255
  const match = str.match(/^(\w+)(?:\((\d+)\))?/);
  if (match) {
    return {
      baseType: match[1],
      isArray: false,
      length: match[2] ? parseInt(match[2]) : undefined
    };
  }

  return { baseType: str, isArray: false };
}

// Compare PostgreSQL type with Sequelize type
function typesMatch(seqTypeStr: string, dbType: string, dbUdtName: string): boolean {
  const { baseType, isArray } = extractBaseType(seqTypeStr);

  // Handle ARRAY types - all array types are compatible
  if (isArray || baseType === "ARRAY") {
    return dbType === "ARRAY" || dbUdtName.startsWith("_");
  }

  // Handle ENUM types - Sequelize ENUM maps to PostgreSQL USER-DEFINED
  if (baseType === "ENUM" && dbType === "USER-DEFINED") {
    return true;
  }

  const expectedTypes = sequelizeToPostgresType(baseType);
  const dbTypeLower = dbType.toLowerCase();
  const udtLower = dbUdtName.toLowerCase();

  return expectedTypes.some(expected =>
    dbTypeLower.includes(expected) || udtLower.includes(expected.replace(" ", "_"))
  );
}

async function compareSchemas(): Promise<ComparisonResult> {
  // Validate required env variables
  const requiredEnv = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      throw new Error(`Missing environment variable: ${key}`);
    }
  }

  const sequelize = new Sequelize({
    dialect: "postgres",
    host: process.env.DB_HOST as string,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER as string,
    password: process.env.DB_PASSWORD as string,
    database: process.env.DB_NAME as string,
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  });

  // Register all models
  const models = [
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
    TokenHistoryModel,
    OccasionModel,
    FeaturedTracksModel,
    KeywordModel,
    TrackKeywordMappingModel,
    CampaignModel,
    FaqSectionModel,
    FaqModel,
    SoundProjectModel,
    ProjectVideoModel,
    ProjectTrackModel,
  ];

  sequelize.addModels(models);

  try {
    await sequelize.authenticate();
    console.log("Connected to database.");

    // Get all tables from DB
    const [dbTables] = await sequelize.query<DBTable>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const dbTableNames = new Set(dbTables.map(t => t.table_name));

    // Get code table names from models
    const codeTableMap = new Map<string, typeof models[number]>();
    for (const model of models) {
      const tableName = model.getTableName() as string;
      codeTableMap.set(tableName, model);
    }
    const codeTableNames = new Set(codeTableMap.keys());

    // Find tables only in code
    const tablesOnlyInCode = [...codeTableNames].filter(t => !dbTableNames.has(t));

    // Find tables only in DB (excluding known system/external tables)
    const excludedTables = new Set([
      "brands_info",           // Managed by Python backend
      "spatial_ref_sys",       // PostGIS
      "geography_columns",     // PostGIS
      "geometry_columns",      // PostGIS
    ]);
    const tablesOnlyInDB = [...dbTableNames].filter(t => !codeTableNames.has(t) && !excludedTables.has(t));

    // Compare columns for matching tables
    const tableDiffs: TableDiff[] = [];

    for (const tableName of codeTableNames) {
      if (!dbTableNames.has(tableName)) continue;

      const model = codeTableMap.get(tableName)!;
      const modelAttributes = model.getAttributes();

      // Get DB columns
      const [dbColumns] = await sequelize.query<DBColumn>(`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length,
          udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = '${tableName}'
        ORDER BY ordinal_position;
      `);

      const dbColumnMap = new Map<string, DBColumn>();
      for (const col of dbColumns) {
        dbColumnMap.set(col.column_name, col);
      }
      const dbColumnNames = new Set(dbColumnMap.keys());

      // Get code column names
      const codeColumnNames = new Set(Object.keys(modelAttributes));

      // Find columns only in code
      const columnsOnlyInCode = [...codeColumnNames].filter(c => !dbColumnNames.has(c));

      // Find columns only in DB
      const columnsOnlyInDB = [...dbColumnNames].filter(c => !codeColumnNames.has(c));

      // Compare types and nullability for matching columns
      const typeMismatches: ColumnDiff[] = [];
      const nullabilityMismatches: ColumnDiff[] = [];

      for (const colName of codeColumnNames) {
        if (!dbColumnNames.has(colName)) continue;

        const codeAttr = modelAttributes[colName] as ModelAttributeColumnOptions;
        const dbCol = dbColumnMap.get(colName)!;

        // Type comparison
        const codeType = codeAttr.type?.toString() || "UNKNOWN";
        if (!typesMatch(codeType, dbCol.data_type, dbCol.udt_name)) {
          typeMismatches.push({
            column: colName,
            issue: "Type mismatch",
            codeValue: codeType,
            dbValue: `${dbCol.data_type} (udt: ${dbCol.udt_name})`,
          });
        }

        // Nullability comparison
        // Skip nullability check for primary keys - they are always NOT NULL in DB
        // even if not explicitly set in Sequelize (due to @PrimaryKey decorator)
        const isPrimaryKey = codeAttr.primaryKey === true;
        if (!isPrimaryKey) {
          const codeAllowNull = codeAttr.allowNull !== false;
          const dbAllowNull = dbCol.is_nullable === "YES";
          if (codeAllowNull !== dbAllowNull) {
            nullabilityMismatches.push({
              column: colName,
              issue: "Nullability mismatch",
              codeValue: codeAllowNull ? "nullable" : "not null",
              dbValue: dbAllowNull ? "nullable" : "not null",
            });
          }
        }
      }

      // Only add if there are differences
      if (
        columnsOnlyInCode.length > 0 ||
        columnsOnlyInDB.length > 0 ||
        typeMismatches.length > 0 ||
        nullabilityMismatches.length > 0
      ) {
        tableDiffs.push({
          tableName,
          columnsOnlyInCode,
          columnsOnlyInDB,
          typeMismatches,
          nullabilityMismatches,
        });
      }
    }

    // Calculate summary
    const totalColumnDifferences = tableDiffs.reduce((sum, diff) => {
      return sum +
        diff.columnsOnlyInCode.length +
        diff.columnsOnlyInDB.length +
        diff.typeMismatches.length +
        diff.nullabilityMismatches.length;
    }, 0);

    const result: ComparisonResult = {
      timestamp: new Date().toISOString(),
      tablesOnlyInCode,
      tablesOnlyInDB,
      tableDiffs,
      summary: {
        totalTablesInCode: codeTableNames.size,
        totalTablesInDB: dbTableNames.size,
        tablesWithDifferences: tableDiffs.length,
        totalColumnDifferences,
      },
    };

    await sequelize.close();
    return result;

  } catch (error) {
    await sequelize.close();
    throw error;
  }
}

function formatReport(result: ComparisonResult): string {
  const lines: string[] = [];

  lines.push("=".repeat(80));
  lines.push("SCHEMA COMPARISON REPORT");
  lines.push(`Generated: ${result.timestamp}`);
  lines.push("=".repeat(80));
  lines.push("");

  // Summary
  lines.push("SUMMARY");
  lines.push("-".repeat(40));
  lines.push(`Total tables in code: ${result.summary.totalTablesInCode}`);
  lines.push(`Total tables in DB: ${result.summary.totalTablesInDB}`);
  lines.push(`Tables with differences: ${result.summary.tablesWithDifferences}`);
  lines.push(`Total column differences: ${result.summary.totalColumnDifferences}`);
  lines.push("");

  // Tables only in code
  if (result.tablesOnlyInCode.length > 0) {
    lines.push("TABLES ONLY IN CODE (not in DB)");
    lines.push("-".repeat(40));
    for (const table of result.tablesOnlyInCode) {
      lines.push(`  - ${table}`);
    }
    lines.push("");
  }

  // Tables only in DB
  if (result.tablesOnlyInDB.length > 0) {
    lines.push("TABLES ONLY IN DB (not in code)");
    lines.push("-".repeat(40));
    for (const table of result.tablesOnlyInDB) {
      lines.push(`  - ${table}`);
    }
    lines.push("");
  }

  // Table differences
  if (result.tableDiffs.length > 0) {
    lines.push("TABLE DIFFERENCES");
    lines.push("=".repeat(80));

    for (const diff of result.tableDiffs) {
      lines.push("");
      lines.push(`TABLE: ${diff.tableName}`);
      lines.push("-".repeat(40));

      if (diff.columnsOnlyInCode.length > 0) {
        lines.push("  Columns only in CODE (missing from DB):");
        for (const col of diff.columnsOnlyInCode) {
          lines.push(`    - ${col}`);
        }
      }

      if (diff.columnsOnlyInDB.length > 0) {
        lines.push("  Columns only in DB (missing from code):");
        for (const col of diff.columnsOnlyInDB) {
          lines.push(`    - ${col}`);
        }
      }

      if (diff.typeMismatches.length > 0) {
        lines.push("  Type mismatches:");
        for (const mismatch of diff.typeMismatches) {
          lines.push(`    - ${mismatch.column}:`);
          lines.push(`        Code: ${mismatch.codeValue}`);
          lines.push(`        DB:   ${mismatch.dbValue}`);
        }
      }

      if (diff.nullabilityMismatches.length > 0) {
        lines.push("  Nullability mismatches:");
        for (const mismatch of diff.nullabilityMismatches) {
          lines.push(`    - ${mismatch.column}:`);
          lines.push(`        Code: ${mismatch.codeValue}`);
          lines.push(`        DB:   ${mismatch.dbValue}`);
        }
      }
    }
  }

  if (result.summary.totalColumnDifferences === 0 &&
      result.tablesOnlyInCode.length === 0 &&
      result.tablesOnlyInDB.length === 0) {
    lines.push("");
    lines.push("No differences found between code schema and database schema.");
  }

  lines.push("");
  lines.push("=".repeat(80));
  lines.push("END OF REPORT");
  lines.push("=".repeat(80));

  return lines.join("\n");
}

async function main() {
  console.log("Starting schema comparison...");
  console.log("NOTE: This is a READ-ONLY operation. No database changes will be made.");
  console.log("");

  try {
    const result = await compareSchemas();
    const report = formatReport(result);

    // Print to console
    console.log(report);

    // Save to file
    const logDir = path.join(__dirname, "..", "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFile = path.join(logDir, `schema-diff-${timestamp}.log`);
    fs.writeFileSync(logFile, report);
    console.log(`\nReport saved to: ${logFile}`);

    // Also save JSON version for programmatic access
    const jsonFile = path.join(logDir, `schema-diff-${timestamp}.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(result, null, 2));
    console.log(`JSON saved to: ${jsonFile}`);

  } catch (error) {
    console.error("Error during schema comparison:", error);
    process.exit(1);
  }
}

main();

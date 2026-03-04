import * as XLSX from "xlsx";
import { Sequelize } from "sequelize-typescript";
import { OwnerModel } from "../services/persistence-service/owner/modules.export";
import { config } from "dotenv";

config();

// ============ DATABASE CONFIG (from env) ============
const DB_CONFIG = {
  host: process.env.DB_HOST as string,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,
};

// ============ GOOGLE SHEET CONFIG ============
const SHEET_ID = "1-T1FSA32AMhxFSWtM6hJ8_9bNp9ZbjMCS_ju4sKburI";
const GID = "919152157";
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

interface SheetRow {
  ownerCode: string;
  type: string;
  subType: string;
}

async function fetchSheetData(): Promise<SheetRow[]> {
  console.log("Fetching data from Google Sheet...");

  const response = await fetch(SHEET_CSV_URL, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}`);
  }

  const csvBuffer = Buffer.from(await response.arrayBuffer());
  const workbook = XLSX.read(csvBuffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet);

  if (rows.length === 0) {
    throw new Error("No data found in the sheet.");
  }

  console.log(`Detected columns: ${Object.keys(rows[0]).join(", ")}`);

  return rows.map((row) => ({
    ownerCode: String(row["ownerCode"] || "").trim(),
    type: String(row["type"] || "").trim(),
    subType: String(row["subType"] || "").trim(),
  }));
}

async function importOwners() {
  const sequelize = new Sequelize({
    dialect: "postgres",
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    username: DB_CONFIG.username,
    password: DB_CONFIG.password,
    database: DB_CONFIG.database,
    logging: false,
    define: {
      freezeTableName: true,
      timestamps: true,
    },
  });

  sequelize.addModels([OwnerModel]);

  try {
    await sequelize.authenticate();
    console.log("Connected to database");

    const rows = await fetchSheetData();
    console.log(`Found ${rows.length} rows in the sheet`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      if (!row.ownerCode) {
        skippedCount++;
        continue;
      }

      try {
        await OwnerModel.upsert(
          {
            ownerCode: row.ownerCode,
            type: row.type || undefined,
            subType: row.subType || undefined,
          },
          {
            conflictFields: ["ownerCode"],
          }
        );

        successCount++;
        if (successCount % 100 === 0) {
          console.log(`Processed ${successCount} owners...`);
        }
      } catch (err: any) {
        errorCount++;
        console.error(`Error processing ownerCode "${row.ownerCode}":`, err.message);
      }
    }

    console.log(
      `\nImport complete: ${successCount} succeeded, ${skippedCount} skipped, ${errorCount} failed`
    );
  } catch (err) {
    console.error("Import failed:", err);
  } finally {
    await sequelize.close();
  }
}

importOwners();

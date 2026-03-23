import * as XLSX from "xlsx";
import { TrackModel } from "../services/persistence-service/track/schemas/track.schema";
import { sequelize } from "../services/persistence-service/database";
import * as path from "path";

// ============ CONFIG ============
// Pass a Google Sheets URL or a local Excel file path as the first argument
const INPUT = process.argv[2] || path.join(__dirname, "release-dates.xlsx");

interface SheetRow {
  uniqueCode: string;
  releaseYear: number | null;
  releaseDate: string | null;
}

function parseReleaseDate(rawDate: any, rawYear?: any): Date | null {
  const str = String(rawDate ?? "").trim();

  if (str && str !== "undefined") {
    // Year-only: "2019"
    if (/^\d{4}$/.test(str)) {
      return new Date(`${str}-01-01`);
    }

    // DD.MM.YYYY → "18.12.2024"
    const dotDMY = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dotDMY) {
      return new Date(`${dotDMY[3]}-${dotDMY[2].padStart(2,"0")}-${dotDMY[1].padStart(2,"0")}`);
    }

    // DD-MM-YYYY → "18-12-2024"
    const dashDMY = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dashDMY) {
      return new Date(`${dashDMY[3]}-${dashDMY[2].padStart(2,"0")}-${dashDMY[1].padStart(2,"0")}`);
    }

    // DD/MM/YYYY → "18/12/2024"
    const slashDMY = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashDMY) {
      return new Date(`${slashDMY[3]}-${slashDMY[2].padStart(2,"0")}-${slashDMY[1].padStart(2,"0")}`);
    }

    // YYYY-MM-DD or any other JS-parseable format
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d;
    }

    // Could not parse — log the actual value for visibility
    console.warn(`  [WARN] Could not parse ReleaseDate value: "${str}"`);
  }

  // Fallback: use ReleaseYear → Jan 1 of that year
  const yearStr = String(rawYear ?? "").trim();
  if (/^\d{4}$/.test(yearStr)) {
    return new Date(`${yearStr}-01-01`);
  }

  return null;
}

/**
 * Converts a Google Sheets edit URL to a CSV export URL.
 * Input:  https://docs.google.com/spreadsheets/d/SHEET_ID/edit?gid=GID#gid=GID
 * Output: https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=GID
 */
function toCSVExportURL(url: string): string {
  const sheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!sheetIdMatch) throw new Error("Could not extract Sheet ID from URL.");
  const sheetId = sheetIdMatch[1];

  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function parseRows(rows: any[]): SheetRow[] {
  if (rows.length === 0) throw new Error("No data found in the sheet.");
  console.log(`Detected columns: ${Object.keys(rows[0]).join(", ")}`);

  // Show sample ReleaseDate values to debug parsing issues
  const samples = rows.slice(0, 10).map((r) => r["ReleaseDate"] ?? r["releaseDate"] ?? "(empty)");
  console.log(`Sample ReleaseDate values (first 10 rows): ${JSON.stringify(samples)}\n`);

  return rows.map((row) => ({
    uniqueCode: String(row["unique-code"] || row["uniqueCode"] || row["UniqueCode"] || "").trim(),
    releaseYear: row["ReleaseYear"] ?? row["releaseYear"] ?? null,
    releaseDate: row["ReleaseDate"] ?? row["releaseDate"] ?? null,
  }));
}

async function loadData(input: string): Promise<SheetRow[]> {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    const csvURL = toCSVExportURL(input);
    console.log(`Fetching Google Sheet as CSV...\n${csvURL}`);
    const response = await fetch(csvURL, { redirect: "follow" });
    if (!response.ok) throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return parseRows(XLSX.utils.sheet_to_json(sheet, { raw: true }));
  }

  console.log(`Reading local Excel file: ${input}`);
  const workbook = XLSX.readFile(input);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return parseRows(XLSX.utils.sheet_to_json(sheet, { raw: true }));
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log("Connected to database\n");

    const rows = await loadData(INPUT);
    console.log(`Found ${rows.length} rows in the sheet\n`);

    let updated = 0;
    let skippedNoDate = 0;
    let skippedNoCode = 0;
    let notFound = 0;
    let errors = 0;

    for (const row of rows) {
      if (!row.uniqueCode) {
        skippedNoCode++;
        continue;
      }

      const parsedDate = parseReleaseDate(row.releaseDate, row.releaseYear);

      if (!parsedDate) {
        console.warn(`[SKIP] ${row.uniqueCode} — no ReleaseDate or ReleaseYear in sheet`);
        skippedNoDate++;
        continue;
      }

      try {
        const track = await TrackModel.findOne({ where: { trackCode: row.uniqueCode } });

        if (!track) {
          console.warn(`[NOT FOUND] trackCode="${row.uniqueCode}"`);
          notFound++;
          continue;
        }

        track.releaseDate = parsedDate;
        await track.save();

        updated++;
        console.log(`[UPDATED] ${row.uniqueCode} → ${parsedDate.toISOString().split("T")[0]}`);
      } catch (err: any) {
        errors++;
        console.error(`[ERROR] ${row.uniqueCode}: ${err.message}`);
      }
    }

    console.log(`
============================
  Update complete
============================
  Updated:               ${updated}
  No parseable date:     ${skippedNoDate}
  Missing unique-code:   ${skippedNoCode}
  Not found in DB:       ${notFound}
  Errors:                ${errors}
============================`);
  } finally {
    await sequelize.close();
  }
}

run();

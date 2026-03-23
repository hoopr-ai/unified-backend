import { Client } from "pg";

// ============ SOURCE DATABASE ============
const SOURCE_DB_CONFIG = {
  // host: "34.100.172.44",
  // port: 5432,
  // user: "s-prod",
  // password: "ROUG2gact4whif_oorn",
  // database: "S-PROD",
  host: "34.47.193.1",
  port: 5432,
  user: "hoopr-server",
  password: "Sz6J8J77X2VFuHd9GzR3",
  database: "production",
  

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  // host: process.env.DB_HOST || "34.47.153.109",
  // port: parseInt(process.env.DB_PORT || "5432"),
  // user: process.env.DB_USER || "unified-prod",
  // password: process.env.DB_PASSWORD || 'X"E6o+`{yvN|c30R',
  // database: process.env.DB_NAME || "unified-backend-prod",
  host: "34.47.200.207",
  port: 5432,
  user: "select-server-dev",
  password: "hO82GcLotttB5bLyoeG1",
  database: "sage_staging",
};

// ============ FUZZY MATCH HELPERS ============

// Normalize a string: lowercase, remove punctuation, collapse spaces
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Compute Levenshtein distance between two strings
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Words in occasion titles that are too generic to use for matching
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "of",
  "for",
  "in",
  "on",
  "to",
  "at",
  "is",
  "it",
  "as",
  "day",
  "eve",
  "al",
]);

// Extract meaningful words from a normalized string, excluding stop words
function significantWords(str: string): string[] {
  return str.split(" ").filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

// Check if a single occasion word is matched (exactly or ≤1 typo) in keyword word set
function wordMatches(ocWord: string, kwWords: string[]): boolean {
  for (const kwWord of kwWords) {
    if (kwWord === ocWord) return true;
    // Typo tolerance: same length ±1, Levenshtein ≤ 1
    if (
      Math.abs(kwWord.length - ocWord.length) <= 1 &&
      levenshtein(kwWord, ocWord) <= 1
    ) {
      return true;
    }
  }
  return false;
}

// Returns true ONLY if the keyword clearly and directly relates to the occasion:
// 1. Exact full normalized match
// 2. ALL significant words of the occasion title are found (exact or ≤1 typo)
//    as whole words in the keyword — partial substrings are NOT allowed
function matchesOccasion(keyword: string, occasionTitle: string): boolean {
  const kw = normalize(keyword);
  const oc = normalize(occasionTitle);

  if (!kw || !oc) return false;

  // 1. Exact full match
  if (kw === oc) return true;

  const kwWords = kw.split(" ");
  const ocSignificant = significantWords(oc);

  // No significant occasion words to match on — skip
  if (ocSignificant.length === 0) return false;

  // 2. ALL significant occasion words must be found as whole words in keyword
  //    (one word may have ≤1 typo, e.g. "diwalli" → "diwali")
  return ocSignificant.every((ocWord) => wordMatches(ocWord, kwWords));
}

// ============ STATS ============
const stats = {
  occasionsLoaded: 0,
  keywordsInSource: 0,
  keywordsMatched: 0,
  keywordsSkipped: 0,
  keywordsMigrated: 0,
  keywordsFailed: 0,
  mappingsInSource: 0,
  mappingsMigrated: 0,
  mappingsFailed: 0,
};

// ============ MAIN ============
async function main() {
  const sourceClient = new Client(SOURCE_DB_CONFIG);
  const targetClient = new Client(TARGET_DB_CONFIG);

  try {
    await sourceClient.connect();
    console.log("✅ Connected to source database");

    await targetClient.connect();
    console.log("✅ Connected to target database");

    // ============ STEP 1: Create tables in target if not exist ============
    console.log("\n📦 Step 1: Creating tables in target if not exist...");

    await targetClient.query(`
      CREATE TABLE IF NOT EXISTS public.keywords (
        id uuid NOT NULL,
        keyword varchar(255) NULL,
        name_slug varchar(255) NULL,
        "occasionId" bigint NULL,
        CONSTRAINT keywords_pkey PRIMARY KEY (id)
      )
    `);
    await targetClient.query(`
      ALTER TABLE public.keywords
      ADD COLUMN IF NOT EXISTS "occasionId" bigint NULL
    `);
    console.log("✅ keywords table ready");

    await targetClient.query(`
      CREATE TABLE IF NOT EXISTS public.track_keyword_mappings (
        id uuid NOT NULL,
        "keywordId" uuid NULL,
        "trackId" uuid NULL,
        CONSTRAINT "track_keyword_mappings_keywordId_trackId_key" UNIQUE ("keywordId", "trackId"),
        CONSTRAINT track_keyword_mappings_pkey PRIMARY KEY (id)
      )
    `);
    console.log("✅ track_keyword_mappings table ready");

    // ============ STEP 2: Erase existing data in target ============
    console.log("\n📦 Step 2: Erasing existing data in target...");

    await targetClient.query(`TRUNCATE TABLE public.track_keyword_mappings`);
    console.log("✅ Cleared track_keyword_mappings");

    await targetClient.query(`TRUNCATE TABLE public.keywords`);
    console.log("✅ Cleared keywords");

    // ============ STEP 3: Load occasion titles from target ============
    console.log("\n📦 Step 3: Loading occasions from target...");

    const { rows: occasions } = await targetClient.query(
      `SELECT id, title FROM occasions`,
    );
    stats.occasionsLoaded = occasions.length;
    const occasionTitles: string[] = occasions.map((o: any) => o.title);
    const occasionMap: Map<string, number> = new Map(
      occasions.map((o: any) => [o.title, Number(o.id)]),
    );
    console.log(`✅ Loaded ${occasionTitles.length} occasion titles`);

    if (occasionTitles.length === 0) {
      console.error("❌ No occasions found in target DB. Aborting.");
      return;
    }

    // ============ STEP 4: Fetch all keywords from source ============
    console.log("\n📦 Step 4: Fetching keywords from source...");

    const { rows: allKeywords } = await sourceClient.query(
      `SELECT * FROM keywords ORDER BY keyword`,
    );
    stats.keywordsInSource = allKeywords.length;
    console.log(`✅ Found ${allKeywords.length} keywords in source`);

    // ============ STEP 5: Filter keywords that match any occasion ============
    console.log("\n📦 Step 5: Matching keywords against occasions...");

    const matchedKeywords: Array<any & { matchedOccasionId: number }> = [];
    const skippedKeywords: any[] = [];

    for (const kw of allKeywords) {
      const keyword = kw.keyword || "";
      const matchedTitle = occasionTitles.find((title) =>
        matchesOccasion(keyword, title),
      );

      if (matchedTitle) {
        matchedKeywords.push({
          ...kw,
          matchedOccasionId: occasionMap.get(matchedTitle)!,
        });
      } else {
        skippedKeywords.push(kw);
      }
    }

    stats.keywordsMatched = matchedKeywords.length;
    stats.keywordsSkipped = skippedKeywords.length;

    console.log(`✅ ${matchedKeywords.length} keywords matched to occasions`);
    console.log(`⏭️  ${skippedKeywords.length} keywords skipped (no match)`);

    if (matchedKeywords.length > 0) {
      console.log("\n📋 Matched keywords sample (first 20):");
      matchedKeywords.slice(0, 20).forEach((kw) => {
        console.log(`   "${kw.keyword}" → occasionId: ${kw.matchedOccasionId}`);
      });
    }

    // ============ STEP 6: Migrate matched keywords ============
    console.log("\n📦 Step 6: Migrating matched keywords to target...");

    const migratedKeywordIds = new Set<string>();

    for (const kw of matchedKeywords) {
      try {
        await targetClient.query(
          `INSERT INTO keywords (id, keyword, name_slug, "occasionId")
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [kw.id, kw.keyword, kw.name_slug, kw.matchedOccasionId],
        );
        migratedKeywordIds.add(kw.id);
        stats.keywordsMigrated++;
      } catch (err) {
        stats.keywordsFailed++;
        console.error(
          `❌ Failed to migrate keyword "${kw.keyword}" (${kw.id}):`,
          (err as Error).message,
        );
      }
    }

    console.log(`✅ Migrated ${stats.keywordsMigrated} keywords`);

    if (migratedKeywordIds.size === 0) {
      console.log("⚠️  No keywords migrated, skipping mappings.");
      return;
    }

    // ============ STEP 7: Migrate track_keyword_mappings for matched keywords ============
    console.log(
      "\n📦 Step 7: Fetching track_keyword_mappings for matched keywords...",
    );

    const placeholders = [...migratedKeywordIds]
      .map((_, i) => `$${i + 1}`)
      .join(", ");

    const { rows: mappings } = await sourceClient.query(
      `SELECT * FROM track_keyword_mappings WHERE "keywordId" IN (${placeholders})`,
      [...migratedKeywordIds],
    );

    stats.mappingsInSource = mappings.length;
    console.log(`✅ Found ${mappings.length} mappings to migrate`);

    for (const mapping of mappings) {
      try {
        if (!mapping.id || !mapping.keywordId || !mapping.trackId) {
          console.warn(`⚠️  Skipping mapping with missing fields`);
          continue;
        }

        await targetClient.query(
          `INSERT INTO track_keyword_mappings (id, "keywordId", "trackId")
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [mapping.id, mapping.keywordId, mapping.trackId],
        );
        stats.mappingsMigrated++;
      } catch (err) {
        stats.mappingsFailed++;
        console.error(
          `❌ Failed to migrate mapping ${mapping.id}:`,
          (err as Error).message,
        );
      }
    }

    // ============ SUMMARY ============
    console.log("\n" + "=".repeat(60));
    console.log("📊 MIGRATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`\n✅ Occasions in target:      ${stats.occasionsLoaded}`);
    console.log(`✅ Keywords in source:        ${stats.keywordsInSource}`);
    console.log(`✅ Keywords matched:          ${stats.keywordsMatched}`);
    console.log(`⏭️  Keywords skipped:          ${stats.keywordsSkipped}`);
    console.log(
      `✅ Keywords migrated:         ${stats.keywordsMigrated} success, ${stats.keywordsFailed} failed`,
    );
    console.log(
      `✅ Mappings migrated:         ${stats.mappingsMigrated} success, ${stats.mappingsFailed} failed`,
    );
    console.log("=".repeat(60));
    console.log("✨ Migration completed!\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});

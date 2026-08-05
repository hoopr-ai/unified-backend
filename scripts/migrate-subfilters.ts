/**
 * Migrates sub-filters and their track mappings from the legacy production DB
 * into the unified DB.
 *
 * Scope (in dependency order), per sub-filter type:
 *   1. filters                   — the parent filters referenced by the
 *                                  sub-filters below, resolved against the
 *                                  target (see resolveParentFilters).
 *   2. subFilters                — `type` in SUB_FILTER_TYPES.
 *   3. track_subfilter_mappings  — only rows pointing at the sub-filters above.
 *
 * The two sub-filter types need different parent handling, which is why parent
 * resolution matches on (type, name_slug) rather than on id:
 *
 *   subsfxcategory → parents are `sfxcategory` filters, which did not exist in
 *                    the unified DB at all. They get inserted with their
 *                    original UUIDs.
 *   subgenre       → parents are `genre` filters, which DO already exist in the
 *                    unified DB but under *different* UUIDs (the unified genre
 *                    rows came from a separate migration). Inserting the source
 *                    UUIDs would create 26 duplicate genre filters, so the
 *                    sub-filter's filterId is remapped to the target's id.
 *
 * Both target tables are created here rather than left to `sequelize.sync()`,
 * because production runs with DB_SYNC=false.
 *
 * Target is env-driven (DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / DB_PORT),
 * so it follows whatever .env points at — staging first, then production.
 *
 * Idempotent: re-running upserts filters/sub-filters and skips mappings that
 * already exist. Nothing is ever deleted.
 *
 * Usage:
 *   npx tsx scripts/migrate-subfilters.ts --dry-run          # report only
 *   npx tsx scripts/migrate-subfilters.ts                    # both types
 *   npx tsx scripts/migrate-subfilters.ts --type=subgenre    # one type
 */
import { Client } from "pg";
import { config } from "dotenv";

config();

const DRY_RUN = process.argv.includes("--dry-run");

const typeArg = process.argv.find((a) => a.startsWith("--type="));
const SUB_FILTER_TYPES = typeArg
  ? [typeArg.slice("--type=".length)]
  : ["subsfxcategory", "subgenre"];

// ============ SOURCE DATABASE (legacy production) ============
const SOURCE_DB_CONFIG = {
  host: "34.100.172.44",
  port: 5432,
  user: "s-prod",
  password: "ROUG2gact4whif_oorn",
  database: "production",
};

// ============ TARGET DATABASE (unified) ============
// Driven by .env — sage_staging by default, unified-backend-prod when switched.
const TARGET_DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.200.207",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "select-server-dev",
  password: process.env.DB_PASSWORD || "hO82GcLotttB5bLyoeG1",
  database: process.env.DB_NAME || "sage_staging",
  ssl: { rejectUnauthorized: false },
};

const PARENT_FILTER_STATUS = "ACTIVE";
const BATCH_SIZE = 500;

// Mirrors SubFilterModel / TrackSubFilterMappingModel
// (services/persistence-service/filter/schemas/). No FK constraints, matching
// how filters/track_filter_mappings are already defined in the unified DB.
const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS "subFilters" (
    "id"          UUID PRIMARY KEY,
    "name"        VARCHAR(255),
    "filterId"    UUID,
    "type"        VARCHAR(255),
    "description" TEXT,
    "imageUrl"    TEXT,
    "name_slug"   TEXT
  );

  CREATE INDEX IF NOT EXISTS "subFilters_filterId_idx" ON "subFilters" ("filterId");
  CREATE INDEX IF NOT EXISTS "subFilters_type_idx" ON "subFilters" ("type");

  CREATE TABLE IF NOT EXISTS "track_subfilter_mappings" (
    "id"          UUID PRIMARY KEY,
    "subFilterId" UUID,
    "trackId"     UUID
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "track_subfilter_mappings_subFilterId_trackId_key"
    ON "track_subfilter_mappings" ("subFilterId", "trackId");
  CREATE INDEX IF NOT EXISTS "track_subfilter_mappings_trackId_idx"
    ON "track_subfilter_mappings" ("trackId");
`;

interface SourceFilter {
  id: string;
  name: string;
  type: string | null;
  name_slug: string | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Builds sourceFilterId -> targetFilterId. A parent is matched to the target by
 * id first (already migrated, or a previous run of this script), then by
 * (type, name_slug) — which is what catches the genre parents living under
 * different UUIDs. Only genuinely unmatched parents get inserted.
 *
 * An ambiguous slug (more than one target filter of the same type) is left
 * unresolved rather than guessed; those sub-filters land with filterId NULL and
 * are reported.
 */
async function resolveParentFilters(
  target: Client,
  parents: SourceFilter[],
): Promise<{ idMap: Map<string, string>; inserted: number; ambiguous: SourceFilter[] }> {
  const idMap = new Map<string, string>();
  const ambiguous: SourceFilter[] = [];
  let inserted = 0;

  for (const parent of parents) {
    const { rows: byId } = await target.query(
      `SELECT id FROM filters WHERE id = $1`,
      [parent.id],
    );
    if (byId.length > 0) {
      idMap.set(parent.id, byId[0].id);
      continue;
    }

    const slug = parent.name_slug;
    const { rows: bySlug } = slug
      ? await target.query(
          `SELECT id FROM filters WHERE type = $1 AND name_slug = $2`,
          [parent.type, slug],
        )
      : await target.query(
          `SELECT id FROM filters WHERE type = $1 AND lower(name) = lower($2)`,
          [parent.type, parent.name],
        );

    if (bySlug.length === 1) {
      idMap.set(parent.id, bySlug[0].id);
      console.log(
        `   ↪︎ remapped parent "${parent.name}" (${parent.type}): ${parent.id} → ${bySlug[0].id}`,
      );
      continue;
    }

    if (bySlug.length > 1) {
      ambiguous.push(parent);
      console.warn(
        `   ⚠️  ambiguous parent "${parent.name}" (${parent.type}) — ${bySlug.length} target matches, leaving unresolved`,
      );
      continue;
    }

    // Genuinely absent from the target — insert with the original UUID.
    // The unified `filters` table has NOT NULL name + status; the source has no
    // status column, so new parents land as ACTIVE.
    if (!DRY_RUN) {
      await target.query(
        `INSERT INTO filters (id, name, name_slug, status, type, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [parent.id, parent.name, parent.name_slug, PARENT_FILTER_STATUS, parent.type],
      );
    }
    idMap.set(parent.id, parent.id);
    inserted++;
    console.log(
      `   + inserted parent "${parent.name}" (${parent.type}) ${parent.id}`,
    );
  }

  return { idMap, inserted, ambiguous };
}

async function migrateType(source: Client, target: Client, subFilterType: string) {
  console.log(`\n${"=".repeat(60)}\n📂 ${subFilterType}\n${"=".repeat(60)}`);

  // ============ READ SOURCE ============
  const { rows: subFilters } = await source.query(
    `SELECT id, name, "filterId", type::text AS type, description, "imageUrl", name_slug
       FROM "subFilters"
      WHERE type = $1`,
    [subFilterType],
  );
  console.log(`📦 Source sub-filters: ${subFilters.length}`);

  if (subFilters.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  const subFilterIds = subFilters.map((s) => s.id);
  const parentIds = [
    ...new Set(
      subFilters.map((s) => s.filterId).filter((id): id is string => !!id),
    ),
  ];

  const { rows: parents } = await source.query<SourceFilter>(
    `SELECT id, name, type, name_slug FROM filters WHERE id = ANY($1::uuid[])`,
    [parentIds],
  );
  console.log(`📦 Source parent filters: ${parents.length}`);

  const { rows: mappings } = await source.query(
    `SELECT id, "subFilterId", "trackId"
       FROM track_subfilter_mappings
      WHERE "subFilterId" = ANY($1::uuid[])`,
    [subFilterIds],
  );
  console.log(`📦 Source track mappings: ${mappings.length}`);

  // ============ 1. PARENT FILTERS ============
  console.log("\n🔗 Resolving parent filters against target...");
  const { idMap, inserted, ambiguous } = await resolveParentFilters(target, parents);
  console.log(
    `✅ Parents: ${idMap.size} resolved (${inserted} inserted, ${idMap.size - inserted} matched existing), ${ambiguous.length} ambiguous`,
  );

  // ============ 2. SUB-FILTERS ============
  let subFilterCount = 0;
  let unresolvedParent = 0;
  for (const s of subFilters) {
    // Remap to the target's parent id; NULL rather than a dangling reference.
    const targetFilterId = s.filterId ? (idMap.get(s.filterId) ?? null) : null;
    if (s.filterId && !targetFilterId) unresolvedParent++;

    if (!DRY_RUN) {
      await target.query(
        `INSERT INTO "subFilters" (id, name, "filterId", type, description, "imageUrl", name_slug)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE
           SET name        = EXCLUDED.name,
               "filterId"  = EXCLUDED."filterId",
               type        = EXCLUDED.type,
               description = EXCLUDED.description,
               "imageUrl"  = EXCLUDED."imageUrl",
               name_slug   = EXCLUDED.name_slug`,
        [
          s.id,
          s.name,
          targetFilterId,
          s.type,
          s.description,
          s.imageUrl,
          s.name_slug,
        ],
      );
    }
    subFilterCount++;
  }
  console.log(
    `✅ Sub-filters: ${DRY_RUN ? subFilters.length + " pending" : subFilterCount + " upserted"}` +
      (unresolvedParent > 0
        ? `, ${unresolvedParent} with unresolved parent (filterId NULL)`
        : ""),
  );

  // ============ 3. TRACK MAPPINGS ============
  // Drop mappings whose track never made it into the unified catalogue —
  // there is no FK, so these would otherwise become silent orphans.
  const sourceTrackIds = [
    ...new Set(
      mappings.map((m) => m.trackId).filter((id): id is string => !!id),
    ),
  ];
  const { rows: presentTracks } = await target.query(
    `SELECT id FROM tracks WHERE id = ANY($1::uuid[])`,
    [sourceTrackIds],
  );
  const presentTrackIds = new Set(presentTracks.map((t) => t.id));

  const missingTrackCount = sourceTrackIds.length - presentTrackIds.size;
  const usableMappings = mappings.filter(
    (m) => m.trackId && presentTrackIds.has(m.trackId),
  );
  const skippedMappings = mappings.length - usableMappings.length;

  if (missingTrackCount > 0) {
    console.log(
      `⚠️  ${missingTrackCount}/${sourceTrackIds.length} track(s) absent from target — skipping ${skippedMappings} mapping(s)`,
    );
  }

  let mappingCount = 0;
  if (!DRY_RUN) {
    let processed = 0;
    for (const batch of chunk(usableMappings, BATCH_SIZE)) {
      const values: string[] = [];
      const params: unknown[] = [];
      batch.forEach((m, i) => {
        const p = i * 3;
        values.push(`($${p + 1}, $${p + 2}, $${p + 3})`);
        params.push(m.id, m.subFilterId, m.trackId);
      });

      // DO NOTHING (untargeted) covers both the pkey and the
      // (subFilterId, trackId) unique index on re-runs.
      const result = await target.query(
        `INSERT INTO "track_subfilter_mappings" (id, "subFilterId", "trackId")
         VALUES ${values.join(", ")}
         ON CONFLICT DO NOTHING`,
        params,
      );
      mappingCount += result.rowCount ?? 0;
      processed += batch.length;
      console.log(`⏳ Mappings processed: ${processed}/${usableMappings.length}`);
    }
  }
  console.log(
    `✅ Track mappings: ${DRY_RUN ? usableMappings.length + " pending" : mappingCount + " inserted"}, ${skippedMappings} skipped`,
  );
}

async function migrateSubFilters() {
  const source = new Client(SOURCE_DB_CONFIG);
  const target = new Client(TARGET_DB_CONFIG);

  try {
    await source.connect();
    console.log(
      `✅ Connected to source: ${SOURCE_DB_CONFIG.database}@${SOURCE_DB_CONFIG.host}`,
    );

    await target.connect();
    console.log(
      `✅ Connected to target: ${TARGET_DB_CONFIG.database}@${TARGET_DB_CONFIG.host}`,
    );

    console.log(`🎯 Types: ${SUB_FILTER_TYPES.join(", ")}`);
    if (DRY_RUN) {
      console.log("\n🔍 DRY RUN — no writes will be performed");
    }

    if (!DRY_RUN) {
      await target.query(CREATE_TABLES_SQL);
      console.log('📐 Ensured "subFilters" and "track_subfilter_mappings" exist');
    }

    for (const subFilterType of SUB_FILTER_TYPES) {
      await migrateType(source, target, subFilterType);
    }

    // ============ VERIFY ============
    if (!DRY_RUN) {
      const { rows: verify } = await target.query(
        `SELECT s.type,
                count(DISTINCT s.id)                              AS sub_filters,
                count(DISTINCT s."filterId")                      AS parents,
                count(DISTINCT s.id) FILTER (WHERE s."filterId" IS NULL) AS orphan_sub_filters,
                count(m.id)                                       AS mappings
           FROM "subFilters" s
           LEFT JOIN "track_subfilter_mappings" m ON m."subFilterId" = s.id
          GROUP BY s.type
          ORDER BY s.type`,
      );
      console.log("\n📊 Target totals:");
      console.table(verify);
    }

    console.log("\n✅ Migration complete!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await source.end();
    await target.end();
  }
}

migrateSubFilters();

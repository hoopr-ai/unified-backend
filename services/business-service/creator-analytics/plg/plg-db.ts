// ─── PLG growth analytics — how the queries are run ──────────────────────────
//
// Every PLG query runs in its own READ ONLY transaction with nested-loop joins
// switched off, scoped to that transaction (SET LOCAL), so nothing leaks onto
// the pooled connection afterwards.
//
// ── WHY NESTED LOOPS ARE OFF ────────────────────────────────────────────────
//
// These queries join materialised CTEs to each other. Postgres keeps no
// statistics for a CTE, under-estimates its rows, and then picks a nested loop —
// rescanning one 15k-row CTE for each of 15k rows. Measured on prod
// (2026-09-16): a 7-day cohort trend took 49s that way and 6s with hash joins.
// Index lookups inside LATERAL subqueries still use nested loops, because the
// planner has no alternative there; disabling only makes it avoid them where
// it has one.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../../persistence-service/database";

/** Hard ceiling per statement, so a runaway window cannot hold the shared DB. */
const STATEMENT_TIMEOUT = "120s";

export const plgQuery = <T>(
  sql: string,
  replacements: Record<string, unknown> = {},
): Promise<T[]> =>
  sequelize.transaction(async (transaction) => {
    await sequelize.query("SET TRANSACTION READ ONLY", { transaction });
    await sequelize.query("SET LOCAL enable_nestloop = off", { transaction });
    await sequelize.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`, { transaction });
    return (await sequelize.query(sql, {
      replacements,
      type: QueryTypes.SELECT,
      transaction,
    })) as unknown as T[];
  });

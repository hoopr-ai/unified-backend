-- ─── Deal header fields on token_assigned ───────────────────────────────────
--
-- Backs the plan block above the catalogue cards on Smash My Subscription:
--
--     Organic — One Channel (Annual)                         ● ACTIVE
--     1 channel cleared · Valid for 12 months from activation
--     PLAN ACTIVE FROM  18 August 2026   PLAN EXPIRY DATE  17 August 2027
--
-- `expiryDate` already exists on this table. These three are the rest of it.
--
-- ⚠ ONE HEADER, MANY ROWS — read this before relying on it.
-- token_assigned is one row per (brand, catalogue) per assign call, so a brand
-- with four catalogues has four rows, created on different days and free to
-- carry different expiries (staging today: brand 12 has 7 allocations across 4
-- creation days with 2 distinct expiry dates). These columns are therefore a
-- COPY on each allocation, not one shared fact, and nothing here stops two rows
-- of the same brand from disagreeing about the plan name.
--
-- The read side resolves that deterministically rather than arbitrarily — see
-- pickDealHeader in admin-catalogue-rights.service.ts — but the durable fix, if
-- headers start drifting in practice, is a brand_deals table these rows point
-- at. This migration is deliberately additive so that move stays cheap.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE token_assigned
  -- When the deal starts. Distinct from createdAt: a deal is routinely recorded
  -- before it goes live, and the screen shows the commercial date, not the
  -- data-entry date.
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMPTZ    NULL,

  -- "Organic — One Channel (Annual)". Free text, product-facing.
  ADD COLUMN IF NOT EXISTS "title"     VARCHAR(255)   NULL,

  -- "1 channel cleared · Valid for 12 months from activation".
  ADD COLUMN IF NOT EXISTS "subTitle"  VARCHAR(500)   NULL;

COMMENT ON COLUMN token_assigned."startDate" IS
  'Deal start date shown as PLAN ACTIVE FROM. Not createdAt — deals are recorded before they go live.';
COMMENT ON COLUMN token_assigned."title" IS
  'Deal title for the My Subscription header. Copied per allocation; see the header-resolution note in the service.';
COMMENT ON COLUMN token_assigned."subTitle" IS
  'Deal subtitle for the My Subscription header.';

-- The header read: newest live deal for one brand. Partial, because rows with
-- no startDate are pre-deal-fields allocations that can never win the header.
CREATE INDEX IF NOT EXISTS idx_token_assigned_brand_start
  ON token_assigned ("brandId", "startDate" DESC)
  WHERE "startDate" IS NOT NULL;

COMMIT;

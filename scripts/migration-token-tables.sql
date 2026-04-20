-- =====================================================
-- MIGRATION SCRIPT: Token System Restructure
--
-- This script creates new token_assigned and token_deduction tables
-- and migrates data from token_history and licenses tables.
--
-- SOURCE: token_history (positive entries → token_assigned, negative entries → token_deduction)
-- SOURCE: licenses (→ token_deduction with LICENSE_PURCHASE)
--
-- IMPORTANT: This script does NOT delete any existing data.
-- Old tables (tokens, token_history) will remain intact for verification.
-- =====================================================

-- STEP 1: Create the enum type for deduction reasons
-- =====================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_token_deduction_reason') THEN
    CREATE TYPE enum_token_deduction_reason AS ENUM ('LICENSE_PURCHASE', 'INTERNAL_DEDUCTION');
  END IF;
END $$;

-- STEP 2: Create token_assigned table
-- =====================================================
CREATE TABLE IF NOT EXISTS token_assigned (
  id BIGSERIAL PRIMARY KEY,
  "totalAssignedToken" INTEGER NOT NULL DEFAULT 0,
  "tokenBalance" INTEGER NOT NULL DEFAULT 0,
  "expiryDate" TIMESTAMP WITH TIME ZONE,
  "brandId" BIGINT NOT NULL,
  "type" VARCHAR(255) NOT NULL,
  "ownerIds" TEXT[] DEFAULT '{}',
  "tokenHistoryId" BIGINT, -- Reference to original token_history entry
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT fk_token_assigned_brand
    FOREIGN KEY ("brandId")
    REFERENCES brands(id)
    ON DELETE CASCADE
);

-- Create indexes for token_assigned
CREATE INDEX IF NOT EXISTS idx_token_assigned_brand_id ON token_assigned("brandId");
CREATE INDEX IF NOT EXISTS idx_token_assigned_type ON token_assigned("type");
CREATE INDEX IF NOT EXISTS idx_token_assigned_created_at ON token_assigned("createdAt");

-- STEP 3: Create token_deduction table
-- =====================================================
CREATE TABLE IF NOT EXISTS token_deduction (
  id BIGSERIAL PRIMARY KEY,
  "tokenAssignedId" BIGINT NOT NULL,
  "deductedTokenCount" INTEGER NOT NULL,
  "reason" enum_token_deduction_reason NOT NULL,
  "licenseId" BIGINT,
  "tokenHistoryId" BIGINT, -- Reference to original token_history entry (for INTERNAL_DEDUCTION)
  "deductedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT fk_token_deduction_token_assigned
    FOREIGN KEY ("tokenAssignedId")
    REFERENCES token_assigned(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_token_deduction_license
    FOREIGN KEY ("licenseId")
    REFERENCES licenses(id)
    ON DELETE SET NULL
);

-- Create indexes for token_deduction
CREATE INDEX IF NOT EXISTS idx_token_deduction_token_assigned_id ON token_deduction("tokenAssignedId");
CREATE INDEX IF NOT EXISTS idx_token_deduction_reason ON token_deduction("reason");
CREATE INDEX IF NOT EXISTS idx_token_deduction_license_id ON token_deduction("licenseId");

-- STEP 4: Add tokenId column to licenses table
-- =====================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'licenses' AND column_name = 'tokenId'
  ) THEN
    ALTER TABLE licenses ADD COLUMN "tokenId" BIGINT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_licenses_token_id ON licenses("tokenId");

-- STEP 5: Migrate POSITIVE token_history entries to token_assigned
-- =====================================================
-- Each positive assignedAmount entry becomes a token_assigned record
-- Initially set tokenBalance = totalAssignedToken (will be adjusted after deductions)
INSERT INTO token_assigned (
  "totalAssignedToken",
  "tokenBalance",
  "expiryDate",
  "brandId",
  "type",
  "ownerIds",
  "tokenHistoryId",
  "createdAt",
  "updatedAt"
)
SELECT
  th."assignedAmount" as "totalAssignedToken",
  th."assignedAmount" as "tokenBalance", -- Will be recalculated after deductions
  th."expiryDate",
  th."brandId",
  th."type",
  COALESCE(th."ownerIds", '{}'),
  th.id as "tokenHistoryId",
  th."createdAt",
  th."updatedAt"
FROM token_history th
WHERE th."assignedAmount" > 0
  AND NOT EXISTS (
    SELECT 1 FROM token_assigned ta WHERE ta."tokenHistoryId" = th.id
  )
ORDER BY th."createdAt" ASC;

-- STEP 6: Create migration function for FIFO deduction mapping
-- =====================================================
CREATE OR REPLACE FUNCTION migrate_deductions_fifo() RETURNS void AS $$
DECLARE
  deduction RECORD;
  assigned RECORD;
  remaining_to_deduct INTEGER;
  deduct_from_this INTEGER;
  current_balance INTEGER;
BEGIN
  -- ========================================
  -- PART A: Migrate NEGATIVE token_history entries (INTERNAL_DEDUCTION)
  -- ========================================
  FOR deduction IN
    SELECT
      th.id as history_id,
      th."brandId",
      th."type",
      ABS(th."assignedAmount") as deduct_amount, -- Convert negative to positive
      th."createdAt" as deducted_at
    FROM token_history th
    WHERE th."assignedAmount" < 0
      AND NOT EXISTS (
        SELECT 1 FROM token_deduction td WHERE td."tokenHistoryId" = th.id
      )
    ORDER BY th."createdAt" ASC
  LOOP
    remaining_to_deduct := deduction.deduct_amount;

    -- Find token_assigned records to deduct from (FIFO - oldest first)
    FOR assigned IN
      SELECT
        ta.id,
        ta."tokenBalance",
        ta."totalAssignedToken",
        (ta."totalAssignedToken" - COALESCE(
          (SELECT SUM(td."deductedTokenCount") FROM token_deduction td WHERE td."tokenAssignedId" = ta.id),
          0
        )) as available_balance
      FROM token_assigned ta
      WHERE ta."brandId" = deduction."brandId"
        AND ta."type" = deduction."type"
        AND ta."createdAt" <= deduction.deducted_at
      ORDER BY ta."createdAt" ASC
    LOOP
      EXIT WHEN remaining_to_deduct <= 0;

      IF assigned.available_balance > 0 THEN
        deduct_from_this := LEAST(remaining_to_deduct, assigned.available_balance);

        INSERT INTO token_deduction (
          "tokenAssignedId",
          "deductedTokenCount",
          "reason",
          "tokenHistoryId",
          "deductedAt",
          "createdAt",
          "updatedAt"
        ) VALUES (
          assigned.id,
          deduct_from_this,
          'INTERNAL_DEDUCTION',
          deduction.history_id,
          deduction.deducted_at,
          NOW(),
          NOW()
        );

        remaining_to_deduct := remaining_to_deduct - deduct_from_this;
      END IF;
    END LOOP;

    -- If still remaining, try without date constraint (fallback)
    IF remaining_to_deduct > 0 THEN
      FOR assigned IN
        SELECT
          ta.id,
          (ta."totalAssignedToken" - COALESCE(
            (SELECT SUM(td."deductedTokenCount") FROM token_deduction td WHERE td."tokenAssignedId" = ta.id),
            0
          )) as available_balance
        FROM token_assigned ta
        WHERE ta."brandId" = deduction."brandId"
          AND ta."type" = deduction."type"
        ORDER BY ta."createdAt" ASC
      LOOP
        EXIT WHEN remaining_to_deduct <= 0;

        IF assigned.available_balance > 0 THEN
          deduct_from_this := LEAST(remaining_to_deduct, assigned.available_balance);

          INSERT INTO token_deduction (
            "tokenAssignedId",
            "deductedTokenCount",
            "reason",
            "tokenHistoryId",
            "deductedAt",
            "createdAt",
            "updatedAt"
          ) VALUES (
            assigned.id,
            deduct_from_this,
            'INTERNAL_DEDUCTION',
            deduction.history_id,
            deduction.deducted_at,
            NOW(),
            NOW()
          );

          remaining_to_deduct := remaining_to_deduct - deduct_from_this;
        END IF;
      END LOOP;
    END IF;

    IF remaining_to_deduct > 0 THEN
      RAISE NOTICE 'Could not fully map INTERNAL_DEDUCTION from token_history id=%, remaining=%',
        deduction.history_id, remaining_to_deduct;
    END IF;
  END LOOP;

  -- ========================================
  -- PART B: Migrate licenses (LICENSE_PURCHASE)
  -- ========================================
  FOR deduction IN
    SELECT
      l.id as license_id,
      l."brandId",
      l."tokenCost" as deduct_amount,
      l."trackCode",
      COALESCE(l."licensedAt", l."createdAt") as deducted_at
    FROM licenses l
    WHERE l."tokenCost" > 0
      AND NOT EXISTS (
        SELECT 1 FROM token_deduction td WHERE td."licenseId" = l.id
      )
    ORDER BY l."createdAt" ASC
  LOOP
    remaining_to_deduct := deduction.deduct_amount;

    -- Get owner type from track
    DECLARE
      owner_type VARCHAR(255);
    BEGIN
      SELECT o.type INTO owner_type
      FROM tracks t
      JOIN owners o ON o.id = ANY(t."ownerId")
      WHERE t."trackCode" = deduction."trackCode"
      LIMIT 1;

      IF owner_type IS NULL THEN
        owner_type := 'FILL_THIS'; -- Manual intervention needed
        RAISE NOTICE 'Could not find owner type for license id=%, trackCode=%',
          deduction.license_id, deduction."trackCode";
      END IF;

      -- Find token_assigned records to deduct from (FIFO - oldest first)
      FOR assigned IN
        SELECT
          ta.id,
          (ta."totalAssignedToken" - COALESCE(
            (SELECT SUM(td."deductedTokenCount") FROM token_deduction td WHERE td."tokenAssignedId" = ta.id),
            0
          )) as available_balance
        FROM token_assigned ta
        WHERE ta."brandId" = deduction."brandId"
          AND ta."type" = owner_type
          AND ta."createdAt" <= deduction.deducted_at
        ORDER BY ta."createdAt" ASC
      LOOP
        EXIT WHEN remaining_to_deduct <= 0;

        IF assigned.available_balance > 0 THEN
          deduct_from_this := LEAST(remaining_to_deduct, assigned.available_balance);

          INSERT INTO token_deduction (
            "tokenAssignedId",
            "deductedTokenCount",
            "reason",
            "licenseId",
            "deductedAt",
            "createdAt",
            "updatedAt"
          ) VALUES (
            assigned.id,
            deduct_from_this,
            'LICENSE_PURCHASE',
            deduction.license_id,
            deduction.deducted_at,
            NOW(),
            NOW()
          );

          -- Update license with tokenId
          UPDATE licenses SET "tokenId" = assigned.id WHERE id = deduction.license_id;

          remaining_to_deduct := remaining_to_deduct - deduct_from_this;
        END IF;
      END LOOP;

      -- If still remaining, try without date constraint (fallback)
      IF remaining_to_deduct > 0 THEN
        FOR assigned IN
          SELECT
            ta.id,
            (ta."totalAssignedToken" - COALESCE(
              (SELECT SUM(td."deductedTokenCount") FROM token_deduction td WHERE td."tokenAssignedId" = ta.id),
              0
            )) as available_balance
          FROM token_assigned ta
          WHERE ta."brandId" = deduction."brandId"
            AND ta."type" = owner_type
          ORDER BY ta."createdAt" ASC
        LOOP
          EXIT WHEN remaining_to_deduct <= 0;

          IF assigned.available_balance > 0 THEN
            deduct_from_this := LEAST(remaining_to_deduct, assigned.available_balance);

            INSERT INTO token_deduction (
              "tokenAssignedId",
              "deductedTokenCount",
              "reason",
              "licenseId",
              "deductedAt",
              "createdAt",
              "updatedAt"
            ) VALUES (
              assigned.id,
              deduct_from_this,
              'LICENSE_PURCHASE',
              deduction.license_id,
              deduction.deducted_at,
              NOW(),
              NOW()
            );

            -- Update license with tokenId (use first matched)
            IF (SELECT "tokenId" FROM licenses WHERE id = deduction.license_id) IS NULL THEN
              UPDATE licenses SET "tokenId" = assigned.id WHERE id = deduction.license_id;
            END IF;

            remaining_to_deduct := remaining_to_deduct - deduct_from_this;
          END IF;
        END LOOP;
      END IF;

      IF remaining_to_deduct > 0 THEN
        RAISE NOTICE 'Could not fully map LICENSE_PURCHASE for license id=%, remaining=%',
          deduction.license_id, remaining_to_deduct;
      END IF;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the migration function
SELECT migrate_deductions_fifo();

-- Clean up the function
DROP FUNCTION IF EXISTS migrate_deductions_fifo();

-- STEP 7: Update tokenBalance for all token_assigned records
-- =====================================================
UPDATE token_assigned ta
SET "tokenBalance" = ta."totalAssignedToken" - COALESCE(
  (SELECT SUM(td."deductedTokenCount") FROM token_deduction td WHERE td."tokenAssignedId" = ta.id),
  0
),
"updatedAt" = NOW();

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check migration counts
SELECT 'POSITIVE token_history entries' as source, COUNT(*) as count
FROM token_history WHERE "assignedAmount" > 0
UNION ALL
SELECT 'token_assigned records' as source, COUNT(*) as count
FROM token_assigned
UNION ALL
SELECT 'NEGATIVE token_history entries' as source, COUNT(*) as count
FROM token_history WHERE "assignedAmount" < 0
UNION ALL
SELECT 'INTERNAL_DEDUCTION records' as source, COUNT(*) as count
FROM token_deduction WHERE reason = 'INTERNAL_DEDUCTION'
UNION ALL
SELECT 'licenses with tokenCost > 0' as source, COUNT(*) as count
FROM licenses WHERE "tokenCost" > 0
UNION ALL
SELECT 'LICENSE_PURCHASE records' as source, COUNT(*) as count
FROM token_deduction WHERE reason = 'LICENSE_PURCHASE';

-- Check total balance comparison (old vs new)
SELECT
  'OLD: tokens table total balance' as metric,
  SUM("tokenBalance") as total
FROM tokens
UNION ALL
SELECT
  'NEW: token_assigned total balance' as metric,
  SUM("tokenBalance") as total
FROM token_assigned;

-- Check licenses that couldn't be matched
SELECT
  'Licenses without tokenId (need manual review)' as metric,
  COUNT(*) as count
FROM licenses
WHERE "tokenId" IS NULL AND "tokenCost" > 0;

-- List unmatched licenses for manual review
-- FILL_THIS: Review and manually set tokenId
SELECT
  l.id as license_id,
  l."brandId",
  l."trackCode",
  l."tokenCost",
  l."licensedAt"
FROM licenses l
WHERE l."tokenId" IS NULL AND l."tokenCost" > 0
ORDER BY l."createdAt" DESC;

-- =====================================================
-- POST-MIGRATION NOTES:
-- =====================================================
-- 1. Review NOTICE messages for any unmapped deductions
-- 2. Review licenses without tokenId (query above)
-- 3. Verify total balances match between old and new tables
-- 4. After verification, old tables (tokens, token_history) can be removed
-- =====================================================

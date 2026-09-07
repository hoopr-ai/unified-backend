-- Label Pages — the CMS-managed storefront page for one record label (owner).
--
-- Until now a label page was hardcoded in the FE: the hero art, the copy and
-- the rails on it all lived in the storefront bundle, so publishing a new label
-- meant a deploy. This table makes the page an entity the Rails CMS can target.
--
-- One row per owner (`ownerId` is unique): a label either has a page or it
-- doesn't. The page's CONTENT is not stored here — the rails on it are ordinary
-- `rails` rows carrying pageName = 'LABEL_<ownerCode>' (see labelPageKey() in
-- services/dto-service/rail/rail.enum.ts). What lives here is the page's own
-- chrome: identity, hero art, copy and SEO.
--
-- `rails.pageName` is VARCHAR(50), so 'LABEL_' + ownerCode must fit in 50
-- characters — the service rejects an ownerCode longer than 44 on create.
--
-- Idempotent: safe to re-run. Seeds nothing; pages are created from the CMS.

BEGIN;

CREATE TABLE IF NOT EXISTS label_pages (
  id                    BIGSERIAL PRIMARY KEY,
  "ownerId"             UUID NOT NULL UNIQUE REFERENCES owners(id),
  "ownerCode"           VARCHAR(255) NOT NULL UNIQUE,
  slug                  VARCHAR(255) NOT NULL UNIQUE,
  title                 VARCHAR(255) NOT NULL,
  description           TEXT,
  "heroImageLink"       VARCHAR(1024),
  "mobileHeroImageLink" VARCHAR(1024),
  "logoImageLink"       VARCHAR(1024),
  "seoTitle"            VARCHAR(255),
  "seoDescription"      TEXT,
  "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ
);

-- The storefront resolves a page by slug, and the rails read-path resolves the
-- 'LABEL_<ownerCode>' page key back to a row on every write validation.
CREATE INDEX IF NOT EXISTS label_pages_active_idx ON label_pages ("isActive");

COMMIT;

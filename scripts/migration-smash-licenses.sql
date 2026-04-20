-- Migration script for Smash licenses
-- Generated on: 2026-04-14T09:57:30.321Z
-- Total users: 35
-- Total licenses: 87

BEGIN;

-- =====================================================
-- User 1: amit@ahoysys.com
-- Organization: Ahoysys, Brand: Ahoysys
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Ahoysys';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Ahoysys', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Ahoysys with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Ahoysys already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Ahoysys' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Ahoysys', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Ahoysys with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Ahoysys already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'amit@ahoysys.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'amit@ahoysys.com', '9810541423', 'ENTERPRISE', '$2b$10$S9LKPeJ.9.Y7S0D2hkxvR.wA./548uqDXx2HtBK/LyHw56JXOU.AK', 'Amit', 'Soni', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: amit@ahoysys.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User amit@ahoysys.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7521', 0, '2025-06-05T14:17:31.177Z', 'ACTIVE', 3999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user amit@ahoysys.com';
END $$;

-- =====================================================
-- User 2: ananya.asija@magicpin.in
-- Organization: Magicpin, Brand: Magicpin
-- Tracks: 2
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Magicpin';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Magicpin', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Magicpin with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Magicpin already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Magicpin' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Magicpin', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Magicpin with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Magicpin already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'ananya.asija@magicpin.in' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'ananya.asija@magicpin.in', '9871952982', 'ENTERPRISE', '$2b$10$LqCrHptGq4uBtCQ.zsN9FOB8JteYRKfeh0mmI4Rkc4566JnkgTnUG', 'Ananya', 'Asija', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: ananya.asija@magicpin.in with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User ananya.asija@magicpin.in already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '121', 0, '2025-08-06T11:45:08.505Z', 'ACTIVE', 19999, false, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '2395', 0, '2025-08-06T11:45:08.505Z', 'ACTIVE', 9999, false, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 2 licenses for user ananya.asija@magicpin.in';
END $$;

-- =====================================================
-- User 3: anil@vervemobi.com
-- Organization: Vervemobi, Brand: Vervemobi
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Vervemobi';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Vervemobi', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Vervemobi with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Vervemobi already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Vervemobi' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Vervemobi', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Vervemobi with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Vervemobi already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'anil@vervemobi.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'anil@vervemobi.com', '7396264090', 'ENTERPRISE', '$2b$10$bCuJUdqCnzrVR6sMFlpXzum85A/uM7k2vLMTLnGipZ1Fq/2u4.NV.', 'Anil', 'Naik', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: anil@vervemobi.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User anil@vervemobi.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '161', 0, '2025-08-06T13:12:31.186Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user anil@vervemobi.com';
END $$;

-- =====================================================
-- User 4: ankitagharat93@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'ankitagharat93@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'ankitagharat93@gmail.com', '9970198224', 'ENTERPRISE', '$2b$10$uVdgzfId3q5o0tItpv67LeRAWEGfWr4bLfbfrlk01wfhdnc.viu6a', 'Ankita', 'Mahajan', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: ankitagharat93@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User ankitagharat93@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '410', 0, '2025-08-30T09:09:49.213Z', 'ACTIVE', 199, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user ankitagharat93@gmail.com';
END $$;

-- =====================================================
-- User 5: anumpharm2008@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'anumpharm2008@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'anumpharm2008@gmail.com', '8010263751', 'ENTERPRISE', '$2b$10$qxDe8ghT86cD1Bieib3akO7Ba.h2ks8v0Twnmc9A6x1M44bTjPrrW', 'ANU', 'DAHIYA', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: anumpharm2008@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User anumpharm2008@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '79', 0, '2025-08-20T08:51:34.157Z', 'ACTIVE', 19999, false, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user anumpharm2008@gmail.com';
END $$;

-- =====================================================
-- User 6: arpanmaity1212@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'arpanmaity1212@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'arpanmaity1212@gmail.com', '9564716480', 'ENTERPRISE', '$2b$10$/zMJImZQ8Gw2pyaoyPu9huaK148lnRBHTTfpMOF8PHliuzdlDoI0a', 'Arpan', 'Maity', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: arpanmaity1212@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User arpanmaity1212@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '6264', 0, '2026-02-07T19:46:44.393Z', 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user arpanmaity1212@gmail.com';
END $$;

-- =====================================================
-- User 7: ashishmehta@bombayshavingcompany.com
-- Organization: Bombayshavingcompany, Brand: Bombayshavingcompany
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Bombayshavingcompany';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Bombayshavingcompany', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Bombayshavingcompany with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Bombayshavingcompany already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Bombayshavingcompany' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Bombayshavingcompany', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Bombayshavingcompany with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Bombayshavingcompany already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'ashishmehta@bombayshavingcompany.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'ashishmehta@bombayshavingcompany.com', '9911614032', 'ENTERPRISE', '$2b$10$yCRHPO9BGCp2jFH0v0BYjeCM6hr8.dwGnRjwJygRYdVjCLlI1J7.G', 'Ashish', 'Mehta', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: ashishmehta@bombayshavingcompany.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User ashishmehta@bombayshavingcompany.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '3185', 0, '2025-08-04T11:38:36.155Z', 'ACTIVE', 4999, false, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user ashishmehta@bombayshavingcompany.com';
END $$;

-- =====================================================
-- User 8: aurablingjewels@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'aurablingjewels@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'aurablingjewels@gmail.com', '9372628741', 'ENTERPRISE', '$2b$10$QOqsxtF2t1lOrY30Hou2A.UoVdni97KKeC72aRr2sHSituzPPUSyC', 'Neha', 'Kotawar', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: aurablingjewels@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User aurablingjewels@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '438', 0, '2025-07-17T06:33:00.382Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user aurablingjewels@gmail.com';
END $$;

-- =====================================================
-- User 9: bhaktimantra.kk@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'bhaktimantra.kk@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'bhaktimantra.kk@gmail.com', '9510321117', 'ENTERPRISE', '$2b$10$ghHzgO..Iar/pvkUQf3Q5.l5CelbGAnGpdUhujQNkvLNAw57Ia6wW', 'Makwana', 'Kinjalsinh ', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: bhaktimantra.kk@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User bhaktimantra.kk@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7347', 0, '2025-09-27T21:05:28.028Z', 'ACTIVE', 1299, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user bhaktimantra.kk@gmail.com';
END $$;

-- =====================================================
-- User 10: contact.gowithsameer@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'contact.gowithsameer@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'contact.gowithsameer@gmail.com', '9322631518', 'ENTERPRISE', '$2b$10$J.xRPU6gCv2fKKmEQD3u5.WQvcHOUCrLxNsBVeslK.b0PMii0qRte', 'Sameer', 'Sheikh', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: contact.gowithsameer@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User contact.gowithsameer@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '6283', 0, '2025-12-04T19:51:06.751Z', 'ACTIVE', 799, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user contact.gowithsameer@gmail.com';
END $$;

-- =====================================================
-- User 11: dablu2strig@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'dablu2strig@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'dablu2strig@gmail.com', '9866240802', 'ENTERPRISE', '$2b$10$qUQ6ZT5h0RY.rBOIJBCcYeNR7/zPc57y1NiCgsauF5aLlnsJZ5pYG', 'Dablu', 'Sahis', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: dablu2strig@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User dablu2strig@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '1828', 0, '2025-08-28T17:59:46.214Z', 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user dablu2strig@gmail.com';
END $$;

-- =====================================================
-- User 12: darshana.hedaoo@zouk.co.in
-- Organization: Zouk, Brand: Zouk
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Zouk';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Zouk', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Zouk with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Zouk already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Zouk' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Zouk', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Zouk with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Zouk already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'darshana.hedaoo@zouk.co.in' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'darshana.hedaoo@zouk.co.in', '9769680802', 'ENTERPRISE', '$2b$10$YduJ/ZthopyNZxlmOkeAJ.m/EeWSUXmb8AFoGP8rmnsk5MkXSlXAe', 'Darshana ', 'Hedaoo', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: darshana.hedaoo@zouk.co.in with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User darshana.hedaoo@zouk.co.in already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7814', 0, '2025-08-14T12:11:24.733Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user darshana.hedaoo@zouk.co.in';
END $$;

-- =====================================================
-- User 13: dharmender947@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'dharmender947@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'dharmender947@gmail.com', '9729172864', 'ENTERPRISE', '$2b$10$3MCWUuY5jWyiJcI.JE7KPu3vKzR4zNmRjzwzYbZDU1wgXAYwYNNPW', 'Dharmender', 'kumar', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: dharmender947@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User dharmender947@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '4722', 0, '2025-09-27T07:29:31.160Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user dharmender947@gmail.com';
END $$;

-- =====================================================
-- User 14: dhyaan.shah@bigshorts.co
-- Organization: Bigshorts, Brand: Bigshorts
-- Tracks: 40
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Bigshorts';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Bigshorts', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Bigshorts with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Bigshorts already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Bigshorts' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Bigshorts', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Bigshorts with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Bigshorts already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'dhyaan.shah@bigshorts.co' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'dhyaan.shah@bigshorts.co', '9429191918', 'ENTERPRISE', '$2b$10$cNriSr/.iB3i0XCpbgXZu.N6YgObae3uCOMq.S7mI1SocFvWm1a7q', 'BigShorts', 'Plus Nine One MediaTech Pvt Ltd', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: dhyaan.shah@bigshorts.co with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User dhyaan.shah@bigshorts.co already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '6176', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7572', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 2999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7598', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '330', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7034', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7363', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 14999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7837', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 7999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7649', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 7999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7844', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7390', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 7999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7599', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7535', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 7999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7028', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7609', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 2999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '6985', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 2999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '6849', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7027', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 2999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7520', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 4999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '822', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '438', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7846', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '8155', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '6178', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '6174', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7391', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 7999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7843', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '6267', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7838', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 7999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '5380', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7693', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 7999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7836', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 7999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7879', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7355', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 4999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7687', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 7999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7482', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 3999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '6913', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '8161', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7847', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '485', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 1599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7924', 0, '2025-10-17T09:56:21.847Z', 'ACTIVE', 2999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 40 licenses for user dhyaan.shah@bigshorts.co';
END $$;

-- =====================================================
-- User 15: dipeeka.sanwal@tonicworldwide.com
-- Organization: Tonicworldwide, Brand: Tonicworldwide
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Tonicworldwide';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Tonicworldwide', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Tonicworldwide with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Tonicworldwide already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Tonicworldwide' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Tonicworldwide', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Tonicworldwide with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Tonicworldwide already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'dipeeka.sanwal@tonicworldwide.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'dipeeka.sanwal@tonicworldwide.com', '9082512601', 'ENTERPRISE', '$2b$10$QzNKbq4evGcEjtCQQy.Kau5jcjBLcAmbhb00oCWp.IYRiGnhKT8zq', 'Dipeeka', 'Sanwal', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: dipeeka.sanwal@tonicworldwide.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User dipeeka.sanwal@tonicworldwide.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '87', 0, '2025-08-12T12:38:25.395Z', 'ACTIVE', 14999, false, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user dipeeka.sanwal@tonicworldwide.com';
END $$;

-- =====================================================
-- User 16: ezfashionapparels@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 5
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'ezfashionapparels@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'ezfashionapparels@gmail.com', '8488906313', 'ENTERPRISE', '$2b$10$7vGL5vty3kKROAJgGpmvZ.Lc2RLxkJnH2zFRNp82j1ivX/bTVo/au', 'Sonali', 'sadhwani', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: ezfashionapparels@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User ezfashionapparels@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '2494', 0, '2025-09-22T10:08:38.204Z', 'ACTIVE', 4999, false, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '104', 0, '2025-09-22T10:08:38.204Z', 'ACTIVE', 14999, false, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '92', 0, '2025-09-22T10:08:38.204Z', 'ACTIVE', 14999, false, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '149', 0, '2025-09-22T10:08:38.204Z', 'ACTIVE', 9999, false, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '86', 0, '2025-09-22T10:08:38.204Z', 'ACTIVE', 14999, false, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 5 licenses for user ezfashionapparels@gmail.com';
END $$;

-- =====================================================
-- User 17: ganesh.padalkar18672@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'ganesh.padalkar18672@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'ganesh.padalkar18672@gmail.com', '9922798990', 'ENTERPRISE', '$2b$10$1KcAPADDS1.oXJ5ALN5um.MZBrhfaNHlvo1XjD1FWb7eA9aOFsTge', 'GANESH', 'PADALKAR', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: ganesh.padalkar18672@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User ganesh.padalkar18672@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '352', 0, '2025-09-15T14:50:25.994Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user ganesh.padalkar18672@gmail.com';
END $$;

-- =====================================================
-- User 18: ishhloh95@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'ishhloh95@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'ishhloh95@gmail.com', '8929398257', 'ENTERPRISE', '$2b$10$sdaBWTEY6X/5JtbvCbCdi.P0/SDW6DhU1TwUnpz4dQk/HIfU33EEa', 'Isha', 'Lohia', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: ishhloh95@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User ishhloh95@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '2395', 0, '2025-08-26T13:51:54.858Z', 'ACTIVE', 9999, false, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user ishhloh95@gmail.com';
END $$;

-- =====================================================
-- User 19: jatinpanchal@waaree.com
-- Organization: Waaree, Brand: Waaree
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Waaree';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Waaree', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Waaree with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Waaree already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Waaree' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Waaree', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Waaree with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Waaree already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'jatinpanchal@waaree.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'jatinpanchal@waaree.com', '8655309582', 'ENTERPRISE', '$2b$10$wbytoGBftQrROgXOWfkN6.KooDBnKK5ZWG.N/.2IBuIjJeGECSf5a', 'Waaree Energies Limited', '', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: jatinpanchal@waaree.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User jatinpanchal@waaree.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '516', 0, '2025-04-15T12:39:38.822Z', 'ACTIVE', 3499, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user jatinpanchal@waaree.com';
END $$;

-- =====================================================
-- User 20: marketingtools@myfrido.com
-- Organization: Myfrido, Brand: Myfrido
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Myfrido';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Myfrido', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Myfrido with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Myfrido already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Myfrido' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Myfrido', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Myfrido with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Myfrido already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'marketingtools@myfrido.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'marketingtools@myfrido.com', '8793021509', 'ENTERPRISE', '$2b$10$Yxp.JhX7oi459F2LIMK5pOHuczgmAC4dng0c7LIbItprJe6r5SWFy', 'Tushar', 'Swami', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: marketingtools@myfrido.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User marketingtools@myfrido.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '5901', 0, '2025-11-05T12:02:14.877Z', 'ACTIVE', 2999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user marketingtools@myfrido.com';
END $$;

-- =====================================================
-- User 21: maseeh@besttt.co
-- Organization: Besttt, Brand: Besttt
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Besttt';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Besttt', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Besttt with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Besttt already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Besttt' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Besttt', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Besttt with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Besttt already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'maseeh@besttt.co' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'maseeh@besttt.co', '9972404305', 'ENTERPRISE', '$2b$10$Imkp1OcskRjyLKGBMPpxtu.c2KARth2WLOv2k3oE66vJcAk90ESly', 'Maseeh', 'Rahman', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: maseeh@besttt.co with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User maseeh@besttt.co already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '378', 0, '2025-09-27T07:31:14.574Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user maseeh@besttt.co';
END $$;

-- =====================================================
-- User 22: nimesh.shinde@1702.com
-- Organization: 1702, Brand: 1702
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = '1702';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('1702', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: 1702 with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization 1702 already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = '1702' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, '1702', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: 1702 with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand 1702 already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'nimesh.shinde@1702.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'nimesh.shinde@1702.com', '8097507076', 'ENTERPRISE', '$2b$10$cEGFhkAvaM1FBf0gyER9P.f1P5B98y7dsfcQk9jz/5owhA0zScbdy', 'Nimesh', 'Shinde', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: nimesh.shinde@1702.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User nimesh.shinde@1702.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '2208', 0, '2025-08-08T05:38:48.916Z', 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user nimesh.shinde@1702.com';
END $$;

-- =====================================================
-- User 23: palvirajrajvi@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'palvirajrajvi@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'palvirajrajvi@gmail.com', '7268035381', 'ENTERPRISE', '$2b$10$/p33hBCtEgM.Nr2zji6y4uBNo48//lgUJqJ7t1JB36BfLy5c2Qvqm', 'Rachana ', 'Pal', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: palvirajrajvi@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User palvirajrajvi@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '253', 0, '2025-07-18T05:04:27.769Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user palvirajrajvi@gmail.com';
END $$;

-- =====================================================
-- User 24: pbhardwaj45@icloud.com
-- Organization: Icloud, Brand: Icloud
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Icloud';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Icloud', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Icloud with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Icloud already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Icloud' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Icloud', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Icloud with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Icloud already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'pbhardwaj45@icloud.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'pbhardwaj45@icloud.com', '7400747078', 'ENTERPRISE', '$2b$10$hR9xwB4kjeRXPmLKe8n33uIG6KjAhITjteKuSJV15EeySeikHRduu', 'Prince ', 'Jha ', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: pbhardwaj45@icloud.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User pbhardwaj45@icloud.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '410', 0, '2025-09-07T02:55:15.063Z', 'ACTIVE', 199, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user pbhardwaj45@icloud.com';
END $$;

-- =====================================================
-- User 25: prajapati09abhishek@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'prajapati09abhishek@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'prajapati09abhishek@gmail.com', NULL, 'ENTERPRISE', '$2b$10$rFN5Db4Lj/VFeftq.LDH.OZtSiQyYvWXB.6rOEdUb14ZfL0jVu98a', NULL, NULL, 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: prajapati09abhishek@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User prajapati09abhishek@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '1791', 0, NOW(), 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user prajapati09abhishek@gmail.com';
END $$;

-- =====================================================
-- User 26: rabbit.we@outlook.com
-- Organization: Outlook, Brand: Outlook
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Outlook';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Outlook', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Outlook with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Outlook already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Outlook' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Outlook', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Outlook with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Outlook already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'rabbit.we@outlook.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'rabbit.we@outlook.com', '7428512440', 'ENTERPRISE', '$2b$10$3eXFX51i0kMOe0ZLb.eiieRq/CIRDEZvg8B8ma/4nhlRQv5qNmwgG', 'Aditya', 'M', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: rabbit.we@outlook.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User rabbit.we@outlook.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '1438', 0, '2025-07-29T06:30:13.720Z', 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user rabbit.we@outlook.com';
END $$;

-- =====================================================
-- User 27: rohan.sahu@contentlens.ai
-- Organization: Contentlens, Brand: Contentlens
-- Tracks: 5
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Contentlens';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Contentlens', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Contentlens with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Contentlens already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Contentlens' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Contentlens', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Contentlens with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Contentlens already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'rohan.sahu@contentlens.ai' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'rohan.sahu@contentlens.ai', '9899007012', 'ENTERPRISE', '$2b$10$M.Z8ZqWjaZHzh/XlwBQEmOnSV6Z5JtaPFg2DPwZLKR6q/RB.RUIPe', 'Rohan', 'Sahu', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: rohan.sahu@contentlens.ai with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User rohan.sahu@contentlens.ai already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '2326', 0, '2025-05-15T01:51:31.633Z', 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '1880', 0, '2025-05-15T01:51:31.633Z', 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '2265', 0, '2025-05-15T01:51:31.633Z', 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '1217', 0, '2025-05-15T01:51:31.633Z', 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '2135', 0, '2025-05-15T01:51:31.633Z', 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 5 licenses for user rohan.sahu@contentlens.ai';
END $$;

-- =====================================================
-- User 28: saddamkhan479@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'saddamkhan479@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'saddamkhan479@gmail.com', '9125519900', 'ENTERPRISE', '$2b$10$7kAb6P6hOv9XWvDkcjSM8uzrFBHDSzgzzPkwM0gcUEW859Y8dBUa.', 'Saddam ', 'Khan ', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: saddamkhan479@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User saddamkhan479@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '164', 0, '2025-08-16T11:43:55.131Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user saddamkhan479@gmail.com';
END $$;

-- =====================================================
-- User 29: sales@gruham.studio
-- Organization: Gruham, Brand: Gruham
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gruham';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gruham', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gruham with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gruham already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gruham' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gruham', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gruham with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gruham already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'sales@gruham.studio' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'sales@gruham.studio', '9008797007', 'ENTERPRISE', '$2b$10$ZwMOlrWZsK0MIp8.JuQHf.6G6HMSiPIZ9O3OyZu6.e1FPc910hvFa', 'Gruham', 'Studio', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: sales@gruham.studio with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User sales@gruham.studio already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7363', 0, '2026-02-04T08:29:40.018Z', 'ACTIVE', 12500, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user sales@gruham.studio';
END $$;

-- =====================================================
-- User 30: sandhra2701@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'sandhra2701@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'sandhra2701@gmail.com', '6261558098', 'ENTERPRISE', '$2b$10$hRWKXf8EtIRqWACQ5pQr4u7.XNk5sPk0GPu9BZ1n12plaU5X.Wur.', 'Sandhra', 'Sam', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: sandhra2701@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User sandhra2701@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '1925', 0, '2025-10-03T10:17:27.895Z', 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user sandhra2701@gmail.com';
END $$;

-- =====================================================
-- User 31: sudarshanbhat67@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 5
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'sudarshanbhat67@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'sudarshanbhat67@gmail.com', NULL, 'ENTERPRISE', '$2b$10$Rzu3e1b8Emfx430ZPFUbruYUwiZsoKJaAwnVYVyW/h1r1xVv1meeG', NULL, NULL, 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: sudarshanbhat67@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User sudarshanbhat67@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '252', 0, NOW(), 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '2165', 0, NOW(), 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7868', 0, NOW(), 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7363', 0, NOW(), 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '153', 0, NOW(), 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 5 licenses for user sudarshanbhat67@gmail.com';
END $$;

-- =====================================================
-- User 32: sumitaggarwalyes@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'sumitaggarwalyes@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'sumitaggarwalyes@gmail.com', '9311332113', 'ENTERPRISE', '$2b$10$4kUZgg6Ac6rBnhVXVGlBbOJU7yqq95.0IW6LQ7JR5og6ibWOTqRoq', 'Sushma', 'Aggarwal', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: sumitaggarwalyes@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User sumitaggarwalyes@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '7635', 0, '2025-10-22T15:31:38.438Z', 'ACTIVE', 3999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user sumitaggarwalyes@gmail.com';
END $$;

-- =====================================================
-- User 33: svishal077@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'svishal077@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'svishal077@gmail.com', NULL, 'ENTERPRISE', '$2b$10$u7rkTPoC1nekYEISQpvkIuUAilqWOedbF5zFCxHglKr/4tP1moSqe', NULL, NULL, 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: svishal077@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User svishal077@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '1615', 0, NOW(), 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user svishal077@gmail.com';
END $$;

-- =====================================================
-- User 34: uppalalc@gmail.com
-- Organization: Gmail, Brand: Gmail
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Gmail';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Gmail with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Gmail already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Gmail' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Gmail', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Gmail with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Gmail already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'uppalalc@gmail.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'uppalalc@gmail.com', '9100266531', 'ENTERPRISE', '$2b$10$tdGZgzLbWirEAj7AGiIl..vT/rn8AzNJfoFCBU5FvC.N7OIWzw8WW', 'Lakshmi', 'Chand', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: uppalalc@gmail.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User uppalalc@gmail.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '3649', 0, '2026-01-14T07:59:15.804Z', 'ACTIVE', 999, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user uppalalc@gmail.com';
END $$;

-- =====================================================
-- User 35: vjcja@hsja.com
-- Organization: Hsja, Brand: Hsja
-- Tracks: 1
-- =====================================================

DO $$
DECLARE
  v_org_id BIGINT;
  v_brand_id BIGINT;
  v_user_id INTEGER;
BEGIN
  -- Check if org already exists
  SELECT id INTO v_org_id FROM organizations WHERE name = 'Hsja';
  
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")
    VALUES ('Hsja', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_org_id;
    RAISE NOTICE 'Created organization: Hsja with id %', v_org_id;
  ELSE
    RAISE NOTICE 'Organization Hsja already exists with id %', v_org_id;
  END IF;
  
  -- Check if brand already exists
  SELECT id INTO v_brand_id FROM brands WHERE name = 'Hsja' AND "organizationId" = v_org_id;
  
  IF v_brand_id IS NULL THEN
    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")
    VALUES (v_org_id, 'Hsja', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_brand_id;
    RAISE NOTICE 'Created brand: Hsja with id %', v_brand_id;
  ELSE
    RAISE NOTICE 'Brand Hsja already exists with id %', v_brand_id;
  END IF;
  
  -- Check if user already exists
  SELECT id INTO v_user_id FROM users WHERE email = 'vjcja@hsja.com' AND platform = 'ENTERPRISE';
  
  IF v_user_id IS NULL THEN
    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")
    VALUES (v_brand_id, 'vjcja@hsja.com', NULL, 'ENTERPRISE', '$2b$10$AqzXeunY1NBtrMNmKUBB4.gFGMvejYYfk.7gAcJAwRqxUE.u8AB4e', NULL, NULL, 'ACTIVE', NOW(), NOW())
    RETURNING id INTO v_user_id;
    RAISE NOTICE 'Created user: vjcja@hsja.com with id %', v_user_id;
    
    -- Create user role
    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")
    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());
    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;
  ELSE
    -- Update brand_id if user exists but needs brand association
    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;
    RAISE NOTICE 'User vjcja@hsja.com already exists with id %', v_user_id;
  END IF;
  
  -- Insert licenses
  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")
  VALUES (v_brand_id, v_user_id, '2075', 0, NOW(), 'ACTIVE', 599, NULL, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted 1 licenses for user vjcja@hsja.com';
END $$;

COMMIT;

-- Summary
-- Organizations created: 35
-- Brands created: 35
-- Users created: 35
-- Licenses created: 87
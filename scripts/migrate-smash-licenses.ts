import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const INPUT_FILE = path.join(__dirname, '..', '_select_from_TransactionInfo_ti_left_join_Orders_o_on_o_id_ti_or_202604141504.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'migration-smash-licenses.sql');

interface AddressData {
  firstName: string;
  lastName: string;
  gstNo?: string;
  mobile?: string;
}

interface TransactionRecord {
  order_id: string;
  email: string;
  mobile: string;
  address: string;
  itemId: string;
  sellingPrice: number;
  createdAt: string;
  smashVisible: boolean | null;
}

interface UserData {
  email: string;
  mobile: string;
  firstName: string;
  lastName: string;
  tracks: {
    trackCode: string;
    price: number;
    licensedAt: string;
    smashVisible: boolean | null;
  }[];
}

function generateSecurePassword(): string {
  return crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, 'x');
}

function extractDomainName(email: string): string {
  const domain = email.split('@')[1];
  // Remove common TLDs and extract company name
  const parts = domain.split('.');
  // Return first part (company name) capitalized
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

function escapeString(str: string): string {
  if (!str) return '';
  return str.replace(/'/g, "''").replace(/\\/g, '\\\\');
}

async function main() {
  console.log('Reading JSON file...');
  const rawData = fs.readFileSync(INPUT_FILE, 'utf-8');
  const jsonData = JSON.parse(rawData);
  const records: TransactionRecord[] = Object.values(jsonData)[0] as TransactionRecord[];

  console.log(`Total records: ${records.length}`);

  // Group by email
  const userMap = new Map<string, UserData>();

  for (const record of records) {
    if (!record.email) {
      console.warn('Skipping record with null email:', record.order_id);
      continue;
    }
    const email = record.email.toLowerCase();

    if (!userMap.has(email)) {
      let firstName = '';
      let lastName = '';
      try {
        const address: AddressData | null = record.address ? JSON.parse(record.address) : null;
        firstName = address?.firstName || '';
        lastName = address?.lastName || '';
      } catch (e) {
        console.warn('Failed to parse address for:', email);
      }
      userMap.set(email, {
        email,
        mobile: record.mobile || '',
        firstName,
        lastName,
        tracks: [],
      });
    }

    userMap.get(email)!.tracks.push({
      trackCode: record.itemId,
      price: record.sellingPrice,
      licensedAt: record.createdAt,
      smashVisible: record.smashVisible,
    });
  }

  console.log(`Unique users: ${userMap.size}`);

  // Generate SQL
  const sqlParts: string[] = [];

  sqlParts.push('-- Migration script for Smash licenses');
  sqlParts.push('-- Generated on: ' + new Date().toISOString());
  sqlParts.push('-- Total users: ' + userMap.size);
  sqlParts.push('-- Total licenses: ' + records.length);
  sqlParts.push('');
  sqlParts.push('BEGIN;');
  sqlParts.push('');

  // We'll use CTEs to handle the IDs properly
  let userIndex = 0;
  const passwordsFile: string[] = ['email,password'];

  for (const [email, userData] of userMap) {
    userIndex++;
    const orgName = extractDomainName(email);
    const brandName = orgName;
    const password = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(password, 10);

    passwordsFile.push(`${email},${password}`);

    sqlParts.push(`-- =====================================================`);
    sqlParts.push(`-- User ${userIndex}: ${email}`);
    sqlParts.push(`-- Organization: ${orgName}, Brand: ${brandName}`);
    sqlParts.push(`-- Tracks: ${userData.tracks.length}`);
    sqlParts.push(`-- =====================================================`);
    sqlParts.push('');

    // Use DO block with variables for each user
    sqlParts.push(`DO $$`);
    sqlParts.push(`DECLARE`);
    sqlParts.push(`  v_org_id BIGINT;`);
    sqlParts.push(`  v_brand_id BIGINT;`);
    sqlParts.push(`  v_user_id INTEGER;`);
    sqlParts.push(`BEGIN`);
    sqlParts.push(`  -- Check if org already exists`);
    sqlParts.push(`  SELECT id INTO v_org_id FROM organizations WHERE name = '${escapeString(orgName)}';`);
    sqlParts.push(`  `);
    sqlParts.push(`  IF v_org_id IS NULL THEN`);
    sqlParts.push(`    INSERT INTO organizations (name, description, status, "createdAt", "updatedAt")`);
    sqlParts.push(`    VALUES ('${escapeString(orgName)}', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())`);
    sqlParts.push(`    RETURNING id INTO v_org_id;`);
    sqlParts.push(`    RAISE NOTICE 'Created organization: ${escapeString(orgName)} with id %', v_org_id;`);
    sqlParts.push(`  ELSE`);
    sqlParts.push(`    RAISE NOTICE 'Organization ${escapeString(orgName)} already exists with id %', v_org_id;`);
    sqlParts.push(`  END IF;`);
    sqlParts.push(`  `);
    sqlParts.push(`  -- Check if brand already exists`);
    sqlParts.push(`  SELECT id INTO v_brand_id FROM brands WHERE name = '${escapeString(brandName)}' AND "organizationId" = v_org_id;`);
    sqlParts.push(`  `);
    sqlParts.push(`  IF v_brand_id IS NULL THEN`);
    sqlParts.push(`    INSERT INTO brands ("organizationId", name, description, status, "createdAt", "updatedAt")`);
    sqlParts.push(`    VALUES (v_org_id, '${escapeString(brandName)}', 'Migrated from Smash', 'ACTIVE', NOW(), NOW())`);
    sqlParts.push(`    RETURNING id INTO v_brand_id;`);
    sqlParts.push(`    RAISE NOTICE 'Created brand: ${escapeString(brandName)} with id %', v_brand_id;`);
    sqlParts.push(`  ELSE`);
    sqlParts.push(`    RAISE NOTICE 'Brand ${escapeString(brandName)} already exists with id %', v_brand_id;`);
    sqlParts.push(`  END IF;`);
    sqlParts.push(`  `);
    sqlParts.push(`  -- Check if user already exists`);
    sqlParts.push(`  SELECT id INTO v_user_id FROM users WHERE email = '${escapeString(email)}' AND platform = 'ENTERPRISE';`);
    sqlParts.push(`  `);
    sqlParts.push(`  IF v_user_id IS NULL THEN`);
    sqlParts.push(`    INSERT INTO users ("brandId", email, mobile, platform, password, "firstName", "lastName", status, "createdAt", "updatedAt")`);
    sqlParts.push(`    VALUES (v_brand_id, '${escapeString(email)}', '${escapeString(userData.mobile)}', 'ENTERPRISE', '${escapeString(hashedPassword)}', '${escapeString(userData.firstName)}', '${escapeString(userData.lastName)}', 'ACTIVE', NOW(), NOW())`);
    sqlParts.push(`    RETURNING id INTO v_user_id;`);
    sqlParts.push(`    RAISE NOTICE 'Created user: ${escapeString(email)} with id %', v_user_id;`);
    sqlParts.push(`    `);
    sqlParts.push(`    -- Create user role`);
    sqlParts.push(`    INSERT INTO user_roles ("userId", role, status, "createdAt", "updatedAt")`);
    sqlParts.push(`    VALUES (v_user_id, 'ADMIN', 'ACTIVE', NOW(), NOW());`);
    sqlParts.push(`    RAISE NOTICE 'Created ADMIN role for user %', v_user_id;`);
    sqlParts.push(`  ELSE`);
    sqlParts.push(`    -- Update brand_id if user exists but needs brand association`);
    sqlParts.push(`    UPDATE users SET "brandId" = v_brand_id WHERE id = v_user_id AND "brandId" IS NULL;`);
    sqlParts.push(`    RAISE NOTICE 'User ${escapeString(email)} already exists with id %', v_user_id;`);
    sqlParts.push(`  END IF;`);
    sqlParts.push(`  `);
    sqlParts.push(`  -- Insert licenses`);

    for (const track of userData.tracks) {
      const smashVisibleValue = track.smashVisible === null ? 'NULL' : track.smashVisible.toString();
      sqlParts.push(`  INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", status, price, "smashVisible", "createdAt", "updatedAt")`);
      sqlParts.push(`  VALUES (v_brand_id, v_user_id, '${escapeString(track.trackCode)}', 0, '${track.licensedAt}', 'ACTIVE', ${track.price}, ${smashVisibleValue}, NOW(), NOW())`);
      sqlParts.push(`  ON CONFLICT DO NOTHING;`);
    }

    sqlParts.push(`  `);
    sqlParts.push(`  RAISE NOTICE 'Inserted ${userData.tracks.length} licenses for user ${escapeString(email)}';`);
    sqlParts.push(`END $$;`);
    sqlParts.push('');
  }

  sqlParts.push('COMMIT;');
  sqlParts.push('');
  sqlParts.push('-- Summary');
  sqlParts.push(`-- Organizations created: ${userMap.size}`);
  sqlParts.push(`-- Brands created: ${userMap.size}`);
  sqlParts.push(`-- Users created: ${userMap.size}`);
  sqlParts.push(`-- Licenses created: ${records.length}`);

  // Write SQL file
  fs.writeFileSync(OUTPUT_FILE, sqlParts.join('\n'));
  console.log(`SQL file written to: ${OUTPUT_FILE}`);

  // Write passwords file
  const passwordsFilePath = path.join(__dirname, '..', 'migration-user-passwords.csv');
  fs.writeFileSync(passwordsFilePath, passwordsFile.join('\n'));
  console.log(`Passwords file written to: ${passwordsFilePath}`);

  console.log('\nDone!');
}

main().catch(console.error);

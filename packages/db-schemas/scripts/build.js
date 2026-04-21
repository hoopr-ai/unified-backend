#!/usr/bin/env node
/**
 * Build script for @hoopr-ai/db-schemas
 * Copies schema and DTO files from unified-backend services and updates imports
 */

import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const UNIFIED_BACKEND = join(ROOT, '..', '..');
const SRC = join(ROOT, 'src');

// Clean and create directories
if (existsSync(SRC)) {
  rmSync(SRC, { recursive: true });
}
mkdirSync(join(SRC, 'enums'), { recursive: true });
mkdirSync(join(SRC, 'dto'), { recursive: true });
mkdirSync(join(SRC, 'models'), { recursive: true });

// Enum files to copy
const enumFiles = [
  'dto-service/user/user.enum.ts',
  'dto-service/brand/brand.enum.ts',
  'dto-service/organization/organization.enum.ts',
  'dto-service/filter/filter.enum.ts',
  'dto-service/albums/album.enum.ts',
  'dto-service/artists/artist.enum.ts',
  'dto-service/playlists/playlist.enum.ts',
  'dto-service/faq/faq.enum.ts',
  'dto-service/constants/common.enums.ts',
];

// DTO files to copy
const dtoFiles = [
  'dto-service/licenses/licenses.dto.ts',
  'dto-service/tracks/tracks.dto.ts',
  'dto-service/tracks/track-stream.dto.ts',
  'dto-service/brand/brand.dto.ts',
  'dto-service/organization/organization.dto.ts',
  'dto-service/playlists/playlist.dto.ts',
  'dto-service/albums/album.dto.ts',
  'dto-service/filter/filter.dto.ts',
  'dto-service/occasion/occasion.dto.ts',
  'dto-service/faq/faq.dto.ts',
  'dto-service/faq/faq-section.dto.ts',
  'dto-service/user/user-auth.dto.ts',
  'dto-service/user/user-liked-track.dto.ts',
  'dto-service/user/otp.dto.ts',
  'dto-service/owners/owners.dto.ts',
  'dto-service/constants/error-messages.ts',
  'dto-service/constants/response-messages.ts',
];

// Schema files to copy
const schemaFiles = [
  'persistence-service/user/schemas/user.schema.ts',
  'persistence-service/user/schemas/user-role.schema.ts',
  'persistence-service/user/schemas/user-session.schema.ts',
  'persistence-service/user/schemas/user-activity.schema.ts',
  'persistence-service/user/schemas/user-liked-track.schema.ts',
  'persistence-service/user/schemas/user-stream-history.schema.ts',
  'persistence-service/brand/schemas/brand.schema.ts',
  'persistence-service/organization/schemas/organization.schema.ts',
  'persistence-service/track/schemas/track.schema.ts',
  'persistence-service/track/schemas/featured-tracks.schema.ts',
  'persistence-service/albums/schemas/album.schema.ts',
  'persistence-service/artists/schemas/artist.schema.ts',
  'persistence-service/artists/schemas/track-artist-mapping.schema.ts',
  'persistence-service/filter/schemas/filter.schema.ts',
  'persistence-service/filter/schemas/track-filter-mapping.schema.ts',
  'persistence-service/playlists/schemas/playlist.schema.ts',
  'persistence-service/playlists/schemas/track-playlist-mapping.schema.ts',
  'persistence-service/licenses/schemas/licenses.schema.ts',
  'persistence-service/licenses/schemas/licenseType.schema.ts',
  'persistence-service/licenses/schemas/videoLinks.schema.ts',
  'persistence-service/token/schemas/token.schema.ts',
  'persistence-service/token/schemas/token-history.schema.ts',
  'persistence-service/token/schemas/token-assigned.schema.ts',
  'persistence-service/token/schemas/token-deduction.schema.ts',
  'persistence-service/sku/schemas/sku.schema.ts',
  'persistence-service/owner/schemas/owner.schema.ts',
  'persistence-service/occasion/schemas/occasion.schema.ts',
  'persistence-service/campaign/schemas/campaign.schema.ts',
  'persistence-service/faq/schemas/faq.schema.ts',
  'persistence-service/faq/schemas/faq-section.schema.ts',
  'persistence-service/keyword/schemas/keyword.schema.ts',
  'persistence-service/keyword/schemas/track-keyword-mapping.schema.ts',
  'persistence-service/project/schemas/project-track.schema.ts',
  'persistence-service/project/schemas/project-video.schema.ts',
  'persistence-service/project/schemas/sound-project.schema.ts',
];

function getFileName(filePath) {
  return filePath.split('/').pop();
}

function transformDtoImports(content) {
  let result = content;

  // Transform enum imports from same directory - e.g., './brand.enum' -> '../enums/brand.enum'
  result = result.replace(
    /from ["']\.\/([^"']+)\.enum\.js["']/g,
    'from "../enums/$1.enum"'
  );
  result = result.replace(
    /from ["']\.\/([^"']+)\.enum["']/g,
    'from "../enums/$1.enum"'
  );

  // Transform ./modules.export to ../enums/index
  result = result.replace(
    /from ["']\.\/modules\.export\.js["']/g,
    'from "../enums/index"'
  );
  result = result.replace(
    /from ["']\.\/modules\.export["']/g,
    'from "../enums/index"'
  );

  // Transform ../constants/modules.export to ../enums/index
  result = result.replace(
    /from ["']\.\.\/constants\/modules\.export["']/g,
    'from "../enums/index"'
  );

  // Transform ../constants/common.enums to ../enums/common.enums
  result = result.replace(
    /from ["']\.\.\/constants\/common\.enums["']/g,
    'from "../enums/common.enums"'
  );

  // Transform ../tracks/tracks.dto to ./tracks.dto
  result = result.replace(
    /from ["']\.\.\/tracks\/tracks\.dto["']/g,
    'from "./tracks.dto"'
  );

  // Transform dynamic import types: import("../tracks/tracks.dto") -> import("./tracks.dto")
  result = result.replace(
    /import\(["']\.\.\/tracks\/tracks\.dto["']\)/g,
    'import("./tracks.dto")'
  );

  // Transform ./tracks.dto to ./tracks.dto (same directory)
  result = result.replace(
    /from ["']\.\/tracks\.dto["']/g,
    'from "./tracks.dto"'
  );

  // Transform ../modules.export to ../enums/index
  result = result.replace(
    /from ["']\.\.\/modules\.export["']/g,
    'from "../enums/index"'
  );

  return result;
}

function transformSchemaImports(content) {
  let result = content;

  // Transform dto-service imports to enums (but StreamType goes to dto)
  // ../../../dto-service/modules.export -> ../enums/index (for most enums)
  // But if importing StreamType, need to go to ../dto/track-stream.dto
  result = result.replace(
    /import\s*\{\s*StreamType\s*\}\s*from\s*["']\.\.\/\.\.\/\.\.\/dto-service\/modules\.export["']/g,
    'import { StreamType } from "../dto/track-stream.dto"'
  );

  result = result.replace(
    /from ["']\.\.\/\.\.\/\.\.\/dto-service\/modules\.export["']/g,
    'from "../enums/index"'
  );

  // ../../../dto-service/constants/common.enums -> ../enums/common.enums
  result = result.replace(
    /from ["']\.\.\/\.\.\/\.\.\/dto-service\/constants\/common\.enums["']/g,
    'from "../enums/common.enums"'
  );

  // ../../dto-service/modules.export -> ../enums/index
  result = result.replace(
    /from ["']\.\.\/\.\.\/dto-service\/modules\.export["']/g,
    'from "../enums/index"'
  );

  // ../../{module}/modules.export -> ./user.schema (need to handle differently)
  result = result.replace(
    /from ["']\.\.\/\.\.\/user\/modules\.export["']/g,
    'from "./user.schema"'
  );

  result = result.replace(
    /from ["']\.\.\/\.\.\/track\/modules\.export["']/g,
    'from "./track.schema"'
  );

  // Transform persistence-service schema imports
  // ../../organization/schemas/modules.export -> ./organization.schema
  result = result.replace(
    /from ["']\.\.\/\.\.\/([^/]+)\/schemas\/modules\.export["']/g,
    (match, module) => `from "./${module}.schema"`
  );

  // ../../brand/schemas/modules.export -> ./brand.schema
  result = result.replace(
    /from ["']\.\.\/\.\.\/([^/]+)\/schemas\/([^"']+)\.schema["']/g,
    'from "./$2.schema"'
  );

  // ./modules.export -> ./user.schema (same directory modules.export typically exports user)
  result = result.replace(
    /from ["']\.\/modules\.export["']/g,
    'from "./user.schema"'
  );

  // ./user-role.schema -> ./user-role.schema (same directory)
  result = result.replace(
    /from ["']\.\/([^"']+)\.schema["']/g,
    'from "./$1.schema"'
  );

  return result;
}

// Copy and transform enum files
console.log('Copying enum files...');
for (const file of enumFiles) {
  const srcPath = join(UNIFIED_BACKEND, 'services', file);
  if (existsSync(srcPath)) {
    const content = readFileSync(srcPath, 'utf-8');
    const fileName = getFileName(file);
    writeFileSync(join(SRC, 'enums', fileName), content);
    console.log(`  ✓ ${fileName}`);
  } else {
    console.log(`  ✗ ${file} (not found)`);
  }
}

// Copy and transform DTO files
console.log('Copying DTO files...');
for (const file of dtoFiles) {
  const srcPath = join(UNIFIED_BACKEND, 'services', file);
  if (existsSync(srcPath)) {
    let content = readFileSync(srcPath, 'utf-8');
    content = transformDtoImports(content);
    const fileName = getFileName(file);
    writeFileSync(join(SRC, 'dto', fileName), content);
    console.log(`  ✓ ${fileName}`);
  } else {
    console.log(`  ✗ ${file} (not found)`);
  }
}

// Copy and transform schema files
console.log('Copying schema files...');
for (const file of schemaFiles) {
  const srcPath = join(UNIFIED_BACKEND, 'services', file);
  if (existsSync(srcPath)) {
    let content = readFileSync(srcPath, 'utf-8');
    content = transformSchemaImports(content);
    const fileName = getFileName(file);
    writeFileSync(join(SRC, 'models', fileName), content);
    console.log(`  ✓ ${fileName}`);
  } else {
    console.log(`  ✗ ${file} (not found)`);
  }
}

// Create index files
console.log('Creating index files...');

// Enums index
const enumExports = enumFiles
  .filter(f => existsSync(join(UNIFIED_BACKEND, 'services', f)))
  .map(f => `export * from "./${getFileName(f).replace('.ts', '')}";`)
  .join('\n');
writeFileSync(join(SRC, 'enums', 'index.ts'), enumExports + '\n');

// DTO index
const dtoExports = dtoFiles
  .filter(f => existsSync(join(UNIFIED_BACKEND, 'services', f)))
  .map(f => `export * from "./${getFileName(f).replace('.ts', '')}";`)
  .join('\n');
writeFileSync(join(SRC, 'dto', 'index.ts'), dtoExports + '\n');

// Models index
const modelExports = schemaFiles
  .filter(f => existsSync(join(UNIFIED_BACKEND, 'services', f)))
  .map(f => `export * from "./${getFileName(f).replace('.ts', '')}";`)
  .join('\n');
writeFileSync(join(SRC, 'models', 'index.ts'), modelExports + '\n');

// Main index
const mainIndex = `// Enums
export * from "./enums/index";

// DTOs
export * from "./dto/index";

// Models
export * from "./models/index";
`;
writeFileSync(join(SRC, 'index.ts'), mainIndex);

console.log('\n✓ Build preparation complete! Run "npm run compile" to compile TypeScript.');

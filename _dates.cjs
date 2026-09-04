const fs = require('fs');
const { Client } = require('pg');
const commit = process.argv.includes('--commit');

// Env: anything already exported wins (that's how _stg.cjs points this at
// staging); otherwise fall back to the ACTIVE, uncommented DB_* block in .env.
// Values there are single-quoted, so strip the quotes or auth fails 28P01.
{
  const env = {};
  for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = l.match(/^(DB_[A-Z_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  for (const k of ['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME'])
    process.env[k] = process.env[k] ?? env[k];
}

// From Customer Success_Hoopr Smash_MainTracker → Sheet8.
// Dates read as dd/mm/yy(yy). Sheet name on the left, DB brand name on the
// right where the two differ in spelling/case.
const SHEET = [
  { sheet: 'Pocket FM',            db: 'Pocket FM',            start: '2026-02-20', end: '2027-02-19' },
  { sheet: 'Delhi Capitals',       db: 'Delhi Capitals',       start: '2026-03-20', end: '2027-03-20' },
  { sheet: 'Rajasthan Royals',     db: 'Rajasthan Royals',     start: '2026-03-01', end: '2027-02-28' },
  { sheet: 'Gujarat Titans',       db: 'Gujarat Titans',       start: '2026-04-01', end: '2027-03-31' },
  { sheet: 'Frido',                db: 'Frido',                start: '2026-12-08', end: '2026-12-07',
    warn: 'end date is BEFORE start date in the sheet' },
  { sheet: 'Sterling Holidays',    db: 'Sterling Holidays',    start: '2025-07-24', end: '2026-07-22' },
  { sheet: 'Flowers TV & 24 News', db: 'Flowers Tv & 24 News', start: '2026-01-24', end: '2026-07-23' },
  { sheet: 'Itokri',               db: 'iTokri',               start: '2026-08-20', end: '2027-08-20' },
  { sheet: 'Sangbad Pratidin',     db: 'Sangbad Pratidin Digital Pvt. Ltd',
                                                               start: '2026-08-20', end: '2027-08-20' },
  { sheet: 'Gr8 Designs',          db: 'Gr8 Designs',          start: '2025-11-07', end: '2026-11-07' },
  { sheet: 'Pinkvilla',            db: 'Pinkvilla',            start: '2026-05-02', end: '2027-05-02' },
  { sheet: 'Traya',                db: 'Traya Women',          start: '2026-08-26', end: '2027-08-26' },
  { sheet: 'HumorMe',              db: 'HumorMe',              start: '2026-08-13', end: '2027-08-08' },
  { sheet: 'Country Delight',      db: 'Country Delight',      start: '2025-12-23', end: '2027-01-14' },
  { sheet: 'Tellychakkar',         db: 'Tellychakkar',         start: '2025-11-06', end: '2026-11-06' },
  { sheet: 'BhaDiPa',              db: 'BhaDiPa',              start: '2026-07-09', end: '2027-05-22' },
  { sheet: 'Bharat Martimony',     db: 'Bharat Martimony',     start: '2026-08-04', end: '2027-08-04' },
  { sheet: 'Jayabheri Group',      db: 'Jayabheri Group',      start: '2025-12-13', end: '2028-12-13' },
  // Blank in the sheet — deliberately not written: Pilgrim, Bharat 24 News, Quickcuts.ai
];

(async()=>{
  const c=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),
    user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,
    ssl:{rejectUnauthorized:false}});
  await c.connect();
  const {rows:d}=await c.query('SELECT current_database() db');
  console.log(`target : ${d[0].db}\nmode   : ${commit?'COMMIT (writes)':'DRY-RUN (rolled back)'}\n`);

  // Every brand, plus how many allocations it holds — a brand with 0 cannot
  // carry dates, and that is a different problem from a brand that is absent.
  const {rows:brands}=await c.query(`
    SELECT b.id, b.name,
           (SELECT COUNT(*) FROM token_assigned t WHERE t."brandId"=b.id)::int AS allocs
      FROM brands b`);
  // 11 brand names are duplicated in prod (e.g. 21:"Gujarat Titans" holds 5
  // allocations, 223:"gujarat titans" holds none). Keying a plain Map by name
  // silently kept whichever row the unordered scan returned LAST, so the brand
  // a sheet name resolved to was nondeterministic. Group instead, and pick the
  // one that actually holds tokens; refuse to guess if several do.
  const byName = new Map();
  for (const b of brands) {
    const k = String(b.name).trim().toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(b);
  }
  const resolve = (name) => {
    const group = byName.get(name.trim().toLowerCase());
    if (!group) return { error: 'missing' };
    const holders = group.filter(b => b.allocs > 0);
    if (holders.length === 1) return { brand: holders[0] };
    if (holders.length > 1)
      return { error: 'ambiguous', detail: holders.map(b=>`${b.id}(${b.allocs} alloc)`).join(', ') };
    return { brand: group[0], noAllocs: true };   // exists, holds nothing
  };

  try{
    await c.query('BEGIN');
    let changed=0, already=0;
    const skipped=[], missing=[], noAllocs=[], ambiguous=[];
    for (const row of SHEET) {
      if (row.warn) { skipped.push(`${row.sheet} — ${row.warn}`); continue; }
      const r = resolve(row.db);
      if (r.error === 'missing')   { missing.push(row.sheet); continue; }
      if (r.error === 'ambiguous') { ambiguous.push(`${row.sheet} — ${r.detail}`); continue; }
      const b = r.brand;
      if (r.noAllocs)    { noAllocs.push(`${row.sheet} (brand ${b.id})`); continue; }
      const { rowCount } = await c.query(
        `UPDATE token_assigned SET "startDate"=$2::timestamptz, "expiryDate"=$3::timestamptz,
                "updatedAt"=NOW()
          WHERE "brandId"=$1
            AND ("startDate"  IS DISTINCT FROM $2::timestamptz
             OR  "expiryDate" IS DISTINCT FROM $3::timestamptz)`, [b.id, row.start, row.end]);
      const tag = rowCount ? `${rowCount}/${b.allocs} alloc changed` : `already correct (${b.allocs} alloc)`;
      console.log(`  ${rowCount?'✓':'·'} ${String(row.sheet).padEnd(22)} brand ${String(b.id).padEnd(5)} ${row.start} → ${row.end}   ${tag}`);
      rowCount ? changed += rowCount : already++;
    }
    if (skipped.length) { console.log('\n  SKIPPED (bad data, not written):'); skipped.forEach(s=>console.log(`  ⚠ ${s}`)); }
    if (missing.length)  console.log(`\n  no such brand in DB: ${missing.join(', ')}`);
    if (noAllocs.length) console.log(`  brand exists but holds no tokens (nothing to date): ${noAllocs.join(', ')}`);
    if (ambiguous.length) { console.log('\n  AMBIGUOUS (several same-named brands hold tokens — not written):');
      ambiguous.forEach(a=>console.log(`  ⚠ ${a}`)); }

    const {rows:left}=await c.query(`
      SELECT b.name, COUNT(*)::int allocs FROM token_assigned ta JOIN brands b ON b.id=ta."brandId"
       WHERE ta."startDate" IS NULL GROUP BY b.name ORDER BY 1`);
    console.log(`\n  allocations still with no startDate — ${left.reduce((n,r)=>n+r.allocs,0)} row(s) across ${left.length} brand(s):`);
    console.log(`  ${left.map(r=>`${r.name} (${r.allocs})`).join(', ')}`);

    await c.query(commit?'COMMIT':'ROLLBACK');
    console.log(commit?`\n✅ committed — ${changed} row(s) written, ${already} brand(s) already correct`
                     :`\n✅ dry-run OK — ${changed} row(s) would change, ${already} brand(s) already correct, rolled back`);
  }catch(e){ await c.query('ROLLBACK').catch(()=>{}); console.error('❌',e.message); process.exitCode=1; }
  finally{ await c.end(); }
})();

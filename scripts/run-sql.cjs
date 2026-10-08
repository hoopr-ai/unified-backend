// Runs a .sql file against the database named in .env. Stands in for psql,
// which isn't installed locally.
//
//   node scripts/run-sql.cjs scripts/migration-add-occasion-description.sql
//
// The whole file is sent as one multi-statement query, so a script's own
// BEGIN/COMMIT controls its transaction. Any SELECTs print as tables.
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { Client } = require('pg')

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/run-sql.cjs <file.sql>')
  process.exit(1)
}

const sql = fs.readFileSync(file, 'utf8')

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
})

;(async () => {
  await client.connect()
  console.log(`running ${path.basename(file)} against ${process.env.DB_NAME}@${process.env.DB_HOST}\n`)

  const results = await client.query(sql)
  for (const r of Array.isArray(results) ? results : [results]) {
    if (r.command === 'SELECT' && r.rows.length) {
      console.table(r.rows)
    } else if (['INSERT', 'UPDATE', 'DELETE', 'ALTER'].includes(r.command)) {
      console.log(`${r.command}: ${r.rowCount ?? 0} row(s)`)
    }
  }

  await client.end()
  console.log('\ndone.')
})().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})

// Runs a .sql file against a database. Stands in for psql, which isn't
// installed locally.
//
//   node scripts/run-sql.cjs scripts/migration-add-occasion-description.sql
//   node scripts/run-sql.cjs --env=.env.migration scripts/migration-....sql
//
// Credentials come from .env by default. `--env=<file>` points at a different
// one — required for anything touching production, so prod credentials never
// become the default this script reaches for.
//
// The whole file is sent as one multi-statement query, so a script's own
// BEGIN/COMMIT controls its transaction. Any SELECTs print as tables.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const argv = process.argv.slice(2)
const envArg = argv.find((a) => a.startsWith('--env='))
const envFile = envArg ? envArg.slice('--env='.length) : '.env'
const file = argv.find((a) => !a.startsWith('--'))

if (!file) {
  console.error('usage: node scripts/run-sql.cjs [--env=<file>] <file.sql>')
  process.exit(1)
}

const envPath = path.isAbsolute(envFile)
  ? envFile
  : path.join(__dirname, '..', envFile)
if (!fs.existsSync(envPath)) {
  console.error(`env file not found: ${envPath}`)
  process.exit(1)
}
require('dotenv').config({ path: envPath, override: true })

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
  console.log(
    `running ${path.basename(file)} against ${process.env.DB_NAME}@${process.env.DB_HOST} (env: ${envFile})\n`
  )

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

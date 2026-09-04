const fs=require('fs'); const env={};
for (const l of fs.readFileSync('.env','utf8').split('\n')) {
  const m=l.match(/^#\s*(DB_[A-Z_]+)\s*=\s*(.*)$/); if(m) env[m[1]]=m[2].trim(); }
for (const k of ['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME']) process.env[k]=env[k]??process.env[k];
require('./_dates.cjs');

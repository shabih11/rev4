import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { securityFixturesForMonth } from './database-fixtures.mjs';

// Intentionally accepts no connection URL: production is never a test target.
const container = 'supabase_db_rev4-tests';
const directory = new URL('../supabase/tests/', import.meta.url);
for (const file of readdirSync(directory).filter(file => file.endsWith('.sql')).sort()) {
  let sql = readFileSync(new URL(file, directory), 'utf8');
  if (!/^begin;/mi.test(sql) || !/rollback;\s*(?:select\s+'[^']*'\s+as\s+\w+;\s*)?$/i.test(sql)) {
    throw new Error(`${file} must isolate its fixtures with BEGIN / ROLLBACK`);
  }
  if (file === 'security.sql') sql = securityFixturesForMonth(sql, new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }));
  process.stdout.write(`Database test: ${file}\n`);
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
    '--set', 'ON_ERROR_STOP=on', '--quiet', '--file', '/dev/stdin'], { input: sql, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    // Tests contain synthetic records only; successful query output is deliberately suppressed.
    process.stderr.write(result.error?.message || result.stderr || 'Database test failed');
    process.exit(1);
  }
}

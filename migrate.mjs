/**
 * BizFlow - Ejecutador de migracion D1
 * Ejecuta cada statement SQL individualmente.
 * Si una columna ya existe (duplicate column name), la SALTA y continua.
 *
 * USO:
 *   node migrate.mjs
 *
 * REQUISITO:
 *   npx wrangler login   (solo la primera vez)
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const DB_ID = 'df3d3561-bde1-48e0-863b-edf65926d6ab';
const SQL_FILE = new URL('./migracion.sql', import.meta.url).pathname;

const sql = readFileSync(SQL_FILE, 'utf-8');

// Separar por statements (manejar multi-linea)
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

let ok = 0, skip = 0, err = 0;

for (const stmt of statements) {
  const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
  try {
    const result = execSync(
      `npx wrangler d1 execute bizflow_db --remote --command="${stmt.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    console.log(`  ✅ ${preview}`);
    ok++;
  } catch (e) {
    const msg = e.stderr || e.message;
    if (msg.includes('duplicate column name') || msg.includes('already exists')) {
      console.log(`  ⏭️  ${preview}  → ya existe, saltado`);
      skip++;
    } else {
      console.log(`  ❌ ${preview}`);
      console.log(`     Error: ${msg.substring(0, 120)}`);
      err++;
    }
  }
}

console.log(`\n═══════════════════════════════════`);
console.log(`  ✅ OK: ${ok}   ⏭️ Skip: ${skip}   ❌ Error: ${err}`);
console.log(`═══════════════════════════════════`);

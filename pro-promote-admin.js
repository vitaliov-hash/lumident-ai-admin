import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
for (const line of (fs.existsSync(path.join(root, '.env')) ? fs.readFileSync(path.join(root, '.env'), 'utf8') : '').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
if (!process.env.DATABASE_URL && fs.existsSync('/etc/secrets/DATABASE_URL')) {
  const secretFile = fs.readFileSync('/etc/secrets/DATABASE_URL', 'utf8').trim();
  process.env.DATABASE_URL = (secretFile.match(/^DATABASE_URL=(.*)$/m)?.[1] || secretFile).replace(/^['"]|['"]$/g, '').trim();
}
if (!process.env.DATABASE_URL || !process.env.ADMIN_EMAIL) {
  console.error('Set DATABASE_URL and ADMIN_EMAIL in the private environment.');
  process.exitCode = 1;
} else {
  const { query, pool } = await import('./pro-db.js');
  try {
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    const result = await query("UPDATE users SET role='admin' WHERE email=$1 RETURNING id", [email]);
    if (!result.rowCount) { console.error('Registered user not found.'); process.exitCode = 1; }
    else console.log('Admin role assigned.');
  } catch { console.error('Database operation failed.'); process.exitCode = 1; }
  finally { await pool.end(); }
}

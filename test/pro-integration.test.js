import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const scrypt = promisify(scryptCallback);
function testDatabaseUrl() {
  if (process.env.LUMIDENT_TEST_DATABASE_URL) return process.env.LUMIDENT_TEST_DATABASE_URL;
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const line = envFile.split(/\r?\n/).find(value => value.startsWith('LUMIDENT_TEST_DATABASE_URL='));
    return line?.slice('LUMIDENT_TEST_DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '') || '';
  } catch { return ''; }
}
const databaseUrl = testDatabaseUrl();

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Pro test server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${url}/api/status`);
      const status = await response.json();
      if (response.ok && status.pro) return;
    } catch { /* migrations or server startup are still running */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Pro test server did not become ready');
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

test('Pro auth, database knowledge, and guest chat integration', { skip: !databaseUrl && 'Set LUMIDENT_TEST_DATABASE_URL to an isolated Neon test branch.' }, async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 7000 });
  let child;
  let adminCookie = '';
  const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const adminEmail = `codex-admin-${suffix}@example.invalid`;
  const clientEmail = `codex-client-${suffix}@example.invalid`;
  const adminPassword = `Admin-${randomBytes(18).toString('hex')}`;
  const clientPassword = `Client-${randomBytes(18).toString('hex')}`;
  let addedServiceName = '';

  try {
    await pool.query('SELECT 1');
    const port = await availablePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: databaseUrl, DEEPSEEK_API_KEY: '' },
      stdio: 'ignore'
    });
    await waitForServer(baseUrl, child);

    await pool.query(
      'INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3),($4,$5,$6)',
      [adminEmail, await hashPassword(adminPassword), 'admin', clientEmail, await hashPassword(clientPassword), 'client']
    );

    await t.test('public registration is disabled', async () => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `signup-${suffix}@example.invalid`, password: 'LongEnoughPassword123!' })
      });
      assert.equal(response.status, 403);
    });

    await t.test('password login cannot create a client session', async () => {
      const noRole = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPassword })
      });
      assert.equal(noRole.status, 403);

      const clientAsAdmin = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clientEmail, password: clientPassword, targetRole: 'admin' })
      });
      assert.equal(clientAsAdmin.status, 403);
      assert.equal(clientAsAdmin.headers.get('set-cookie'), null);
    });

    await t.test('administrator session is issued and can read knowledge', async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPassword, targetRole: 'admin' })
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).user.role, 'admin');
      adminCookie = response.headers.get('set-cookie')?.split(';')[0] || '';
      assert.match(adminCookie, /^lumident_session=/);
      const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: adminCookie } });
      assert.equal(me.status, 200);
      assert.equal((await me.json()).user.role, 'admin');
      const knowledge = await fetch(`${baseUrl}/api/admin/knowledge`, { headers: { Cookie: adminCookie } });
      assert.equal(knowledge.status, 200);
      assert.ok((await knowledge.json()).services.length > 0);
    });

    await t.test('guest chat does not persist conversation rows', async () => {
      const before = await pool.query('SELECT count(*)::int AS count FROM conversations');
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'en', messages: [{ role: 'user', content: 'How much does cavity treatment cost?' }] })
      });
      assert.equal(response.status, 200);
      assert.match((await response.json()).reply, /temporarily unavailable/);
      const after = await pool.query('SELECT count(*)::int AS count FROM conversations');
      assert.equal(after.rows[0].count, before.rows[0].count);
    });

    await t.test('administrator changes are visible in public knowledge', async () => {
      const current = await (await fetch(`${baseUrl}/api/admin/knowledge`, { headers: { Cookie: adminCookie } })).json();
      const testService = {
        id: null, name: `Codex test service ${suffix}`, description: 'Temporary integration-test record.',
        name_en: `Codex test service ${suffix}`, description_en: 'Temporary integration-test record.', price_from: 12345
      };
      addedServiceName = testService.name;
      const changed = await fetch(`${baseUrl}/api/admin/knowledge`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ hours: current.hours, hours_en: current.hours_en, services: [...current.services, testService] })
      });
      assert.equal(changed.status, 200);
      const publicKnowledge = await (await fetch(`${baseUrl}/api/knowledge`)).json();
      assert.ok(publicKnowledge.services.some(service => service.name === addedServiceName && service.price_from === 12345));
    });
  } finally {
    if (child && child.exitCode === null) child.kill();
    if (addedServiceName) await pool.query('DELETE FROM services WHERE name=$1', [addedServiceName]).catch(() => {});
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [[adminEmail, clientEmail]]).catch(() => {});
    await pool.end();
  }
});

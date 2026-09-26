import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { query, migrate, pool } from './pro-db.js';

const scrypt = promisify(scryptCallback);
const maxAge = 30 * 24 * 60 * 60 * 1000;
const attempts = new Map();
const hashToken = token => createHash('sha256').update(token).digest('hex');
const id = value => /^\d{1,18}$/.test(String(value)) ? String(value) : null;
const cleanEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
async function passwordMatches(password, stored) {
  const [salt, expectedHex] = String(stored).split(':');
  if (!salt || !/^[a-f0-9]{128}$/.test(expectedHex || '')) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, expected);
}
function respond(res, status, data, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(JSON.stringify(data));
}
function cookie(token, secure) { return `lumident_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge / 1000}${secure ? '; Secure' : ''}`; }
async function bodyOf(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 12000) throw new Error('too_large'); }
  try { return JSON.parse(raw); } catch { throw new Error('bad_json'); }
}
async function currentUser(req) {
  const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('lumident_session='))?.slice(18);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await query('SELECT users.id, users.email, users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=$1 AND expires_at>now()', [hashToken(token)]);
  return result.rows[0] || null;
}
async function issueSession(res, user, secure) {
  const token = randomBytes(32).toString('hex');
  await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')", [hashToken(token), user.id]);
  respond(res, 200, { user: { id: user.id, email: user.email, role: user.role } }, { 'Set-Cookie': cookie(token, secure) });
}
async function knowledge() {
  const [services, settings] = await Promise.all([query('SELECT id,name,description,price_from FROM services ORDER BY position,id'), query("SELECT value FROM settings WHERE key='hours'")]);
  return { services: services.rows, hours: settings.rows[0]?.value || '' };
}
function staticFile(res, file) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
  fs.readFile(file, (error, data) => {
    if (error) return respond(res, 404, { error: 'Страница не найдена.' });
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}
async function aiReply(messages, info, config) {
  if (!config.key) return 'Сейчас цифровой администратор недоступен. Позвоните в клинику для уточнения информации.';
  const rules = config.prompt.replace(/## Данные[\s\S]*?(?=## Правила)/, '').replace(/## Если не знаешь ответ[\s\S]*?(?=## Дополнительные требования)/, '').replace(/- Перед передачей заявки сотруднику кратко повтори собранную информацию\./, '');
  const facts = `Актуальные сведения клиники: часы работы — ${info.hours || 'не указаны'}. Услуги: ${info.services.map(s => `${s.name}, ${s.description}, цена ${s.price_from == null ? 'не указана' : `от ${s.price_from} ₽`}`).join('; ')}. Если сведения отсутствуют, честно скажи об этом. Запись в календарь и доставка заявки сотруднику не подключены: не обещай подтверждённый визит и отправленную заявку.`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(config.baseUrl + '/chat/completions', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` }, body: JSON.stringify({ model: config.model, temperature: 0.3, messages: [{ role: 'system', content: rules + '\n' + facts }, ...messages] }) });
    if (!response.ok) throw new Error('provider');
    const answer = (await response.json())?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('empty');
    return answer.trim().slice(0, 4000);
  } finally { clearTimeout(timer); }
}

export async function startProServer(config) {
  await migrate();
  async function purgeExpired() {
    await query("DELETE FROM conversations WHERE updated_at < now() - interval '30 days'");
    await query('DELETE FROM sessions WHERE expires_at < now()');
  }
  await purgeExpired();
  setInterval(() => purgeExpired().catch(() => console.error('Retention cleanup failed.')), 24 * 60 * 60 * 1000).unref();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const secure = !!process.env.RENDER || (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
        const origin = new URL(req.headers.origin);
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
        if (origin.host !== host) return respond(res, 403, { error: 'Запрос с другого сайта запрещён.' });
      }
      if (url.pathname === '/api/status') return respond(res, 200, { mode: config.key ? 'live' : 'unavailable', pro: true });
      if (url.pathname === '/api/auth/register' && req.method === 'POST') {
        const body = await bodyOf(req); const email = cleanEmail(body.email); const password = body.password;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 12 || password.length > 128) return respond(res, 400, { error: 'Укажите корректную почту и пароль не короче 12 символов.' });
        try {
          const result = await query("INSERT INTO users(email,password_hash,role) VALUES($1,$2,'client') RETURNING id,email,role", [email, await passwordHash(password)]);
          return issueSession(res, result.rows[0], secure);
        } catch (error) { if (error.code === '23505') return respond(res, 409, { error: 'Не удалось создать аккаунт с этими данными.' }); throw error; }
      }
      if (url.pathname === '/api/auth/login' && req.method === 'POST') {
        const body = await bodyOf(req); const email = cleanEmail(body.email); const password = body.password;
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].slice(0, 100);
        const attemptKey = `${ip}:${email}`; const state = attempts.get(attemptKey) || { count: 0, until: Date.now() + 900000 };
        if (state.until < Date.now()) { state.count = 0; state.until = Date.now() + 900000; }
        if (state.count >= 10) return respond(res, 429, { error: 'Слишком много попыток. Попробуйте позже.' });
        const result = await query('SELECT id,email,role,password_hash FROM users WHERE email=$1', [email]);
        const user = result.rows[0];
        if (!user || typeof password !== 'string' || !await passwordMatches(password, user.password_hash)) {
          state.count++; attempts.set(attemptKey, state);
          return respond(res, 401, { error: 'Неверная почта или пароль.' });
        }
        attempts.delete(attemptKey); return issueSession(res, user, secure);
      }
      const user = await currentUser(req);
      if (url.pathname === '/api/auth/me' && req.method === 'GET') return respond(res, 200, { user });
      if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
        const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('lumident_session='))?.slice(18);
        if (token) await query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
        return respond(res, 200, { ok: true }, { 'Set-Cookie': 'lumident_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
      }
      if (url.pathname === '/api/knowledge' && req.method === 'GET') return respond(res, 200, await knowledge());
      if (url.pathname.startsWith('/api/')) {
        if (!user) return respond(res, 401, { error: 'Войдите в аккаунт.' });
        if (url.pathname === '/api/admin/knowledge' && req.method === 'GET') {
          if (user.role !== 'admin') return respond(res, 403, { error: 'Доступ запрещён.' });
          return respond(res, 200, await knowledge());
        }
        if (url.pathname === '/api/admin/knowledge' && req.method === 'PUT') {
          if (user.role !== 'admin') return respond(res, 403, { error: 'Доступ запрещён.' });
          const body = await bodyOf(req);
          if (!Array.isArray(body.services) || body.services.length > 50 || typeof body.hours !== 'string' || body.hours.length < 5 || body.hours.length > 120 || body.services.some(s => (s.id !== null && !id(s.id)) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 120 || typeof s.description !== 'string' || s.description.length > 500 || (s.price_from !== null && (!Number.isInteger(s.price_from) || s.price_from < 0 || s.price_from > 10000000)))) return respond(res, 400, { error: 'Проверьте услуги, цены и часы работы.' });
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const existing = await client.query('SELECT id FROM services');
            const existingIds = new Set(existing.rows.map(row => String(row.id)));
            const suppliedIds = body.services.filter(s => s.id !== null).map(s => String(s.id));
            if (suppliedIds.some(value => !existingIds.has(value)) || new Set(suppliedIds).size !== suppliedIds.length) throw new Error('invalid_service_ids');
            for (let position = 0; position < body.services.length; position++) {
              const s = body.services[position];
              if (s.id === null) await client.query('INSERT INTO services(name,description,price_from,position) VALUES($1,$2,$3,$4)', [s.name.trim(), s.description.trim(), s.price_from, position]);
              else await client.query('UPDATE services SET name=$1,description=$2,price_from=$3,position=$4 WHERE id=$5', [s.name.trim(), s.description.trim(), s.price_from, position, s.id]);
            }
            const removedIds = [...existingIds].filter(value => !suppliedIds.includes(value));
            for (const removedId of removedIds) await client.query('DELETE FROM services WHERE id=$1', [removedId]);
            await client.query("UPDATE settings SET value=$1 WHERE key='hours'", [body.hours.trim()]);
            await client.query('COMMIT');
          } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505' || error.message === 'invalid_service_ids') return respond(res, 400, { error: 'Проверьте названия и список услуг.' }); throw error; } finally { client.release(); }
          return respond(res, 200, await knowledge());
        }
        if (user.role !== 'client') return respond(res, 403, { error: 'Для администратора доступна панель управления.' });
        if (url.pathname === '/api/conversations' && req.method === 'GET') {
          const rows = await query('SELECT id,title,updated_at FROM conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 100', [user.id]);
          return respond(res, 200, { conversations: rows.rows });
        }
        if (url.pathname === '/api/conversations' && req.method === 'POST') {
          const rows = await query('INSERT INTO conversations(user_id) VALUES($1) RETURNING id,title,updated_at', [user.id]);
          return respond(res, 201, { conversation: rows.rows[0] });
        }
        const match = url.pathname.match(/^\/api\/conversations\/(\d+)(?:\/(messages))?$/);
        if (match) {
          const conversationId = id(match[1]);
          const owner = await query('SELECT id,title FROM conversations WHERE id=$1 AND user_id=$2', [conversationId, user.id]);
          if (!owner.rowCount) return respond(res, 404, { error: 'Разговор не найден.' });
          if (!match[2] && req.method === 'DELETE') {
            await query('DELETE FROM conversations WHERE id=$1 AND user_id=$2', [conversationId, user.id]);
            return respond(res, 200, { ok: true });
          }
          if (!match[2] && req.method === 'GET') {
            const rows = await query('SELECT id,role,content,created_at FROM messages WHERE conversation_id=$1 ORDER BY id LIMIT 500', [conversationId]);
            return respond(res, 200, { conversation: owner.rows[0], messages: rows.rows });
          }
          if (match[2] && req.method === 'POST') {
            const body = await bodyOf(req);
            if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > 2000) return respond(res, 400, { error: 'Введите сообщение до 2000 символов.' });
            const text = body.content.trim();
            const prior = await query('SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY id DESC LIMIT 24', [conversationId]);
            const info = await knowledge(); let answer;
            try { answer = await aiReply([...prior.rows.reverse(), { role: 'user', content: text }], info, config); }
            catch { return respond(res, 503, { error: 'Сейчас не удалось получить ответ. Попробуйте ещё раз.' }); }
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              await client.query('INSERT INTO messages(conversation_id,role,content) VALUES($1,$2,$3),($1,$4,$5)', [conversationId, 'user', text, 'assistant', answer]);
              await client.query('UPDATE conversations SET title=CASE WHEN title=$1 THEN $2 ELSE title END, updated_at=now() WHERE id=$3', ['Новый разговор', text.slice(0, 80), conversationId]);
              await client.query('COMMIT');
            } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
            return respond(res, 200, { reply: answer });
          }
        }
        return respond(res, 404, { error: 'Маршрут не найден.' });
      }
      if (req.method !== 'GET') return respond(res, 405, { error: 'Метод не поддерживается.' });
      const relative = url.pathname === '/' ? '/pro.html' : url.pathname;
      const target = path.resolve(config.publicDir, '.' + relative);
      if (!target.startsWith(config.publicDir + path.sep)) return respond(res, 404, { error: 'Страница не найдена.' });
      return staticFile(res, target);
    } catch (error) {
      if (error.message === 'too_large') return respond(res, 413, { error: 'Запрос слишком длинный.' });
      if (error.message === 'bad_json') return respond(res, 400, { error: 'Некорректные данные.' });
      console.error('Request failed:', error.code || error.name || 'error');
      return respond(res, 503, { error: 'Сервис временно недоступен. Попробуйте позже.' });
    }
  });
  server.listen(config.port, config.host, () => console.log(`LumiDent Pro ready on http://${config.host}:${config.port}`));
  return server;
}

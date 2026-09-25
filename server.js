import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
for (const line of (fs.existsSync(path.join(root, '.env')) ? fs.readFileSync(path.join(root, '.env'), 'utf8') : '').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const key = process.env.DEEPSEEK_API_KEY?.trim();
const baseUrl = (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const model = process.env.LLM_MODEL || 'deepseek-chat';
const host = process.env.HOST || '127.0.0.1';
const prompt = fs.readFileSync(path.join(root, 'SYSTEM_PROMPT.md'), 'utf8');
const bookings = new Map();
const requests = [];
const phone = '+7 (495) 123-45-67';

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function sendFile(res, file) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'Страница не найдена.' });
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}
function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 30) return null;
  const clean = messages.map(m => ({ role: m?.role, content: m?.content }));
  if (clean.some(m => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 2000)) return null;
  if (clean.at(-1).role !== 'user') return null;
  return clean;
}
function demoReply(input) {
  const q = input.toLowerCase();
  if (/суперкле|сам прикле|оторвал.*зуб/.test(q)) return 'Пожалуйста, не приклеивайте зуб суперклеем: это может повредить ткани и затруднить лечение. Как действует гарантия в такой ситуации, сможет уточнить врач после осмотра. Свяжитесь с клиникой по телефону ' + phone + '.';
  if (/парковк|бесплатно ночью/.test(q)) return 'У меня нет точной информации о парковке, поэтому не хочу вводить вас в заблуждение. Уточните, пожалуйста, у администратора по телефону ' + phone + '.';
  if (/борщ|погод|футбол|курс валют/.test(q)) return 'Я помогаю с вопросами о стоматологии и клинике LumiDent. Могу рассказать об услугах, ценах или помочь оставить заявку на приём.';
  if (/пломб|материал|гаранти/.test(q)) return 'Для пломб мы используем материалы 3M и Tokuyama. Гарантия на пломбы — до 2 лет; условия зависят от конкретного лечения и соблюдения рекомендаций врача. Хотите записаться на консультацию?';
  if (/кариес/.test(q)) return 'Лечение кариеса стоит от 7 000 ₽. Точную стоимость врач определит после осмотра и диагностики. Хотите оставить заявку на консультацию?';
  if (/час|работ|открыт/.test(q)) return 'Мы работаем ежедневно с 09:00 до 21:00. Адрес: Москва, ул. Сиреневая, 18. Могу помочь оставить заявку на приём.';
  if (/гигиен|чистк/.test(q)) return 'Профессиональная гигиена стоит от 5 500 ₽. Итоговую стоимость уточнит врач после осмотра. Хотите оставить заявку?';
  if (/имплант/.test(q)) return 'Имплантация одного зуба стоит от 85 000 ₽. Используем системы Straumann и Nobel Biocare. Точная стоимость определяется после диагностики; гарантия на хирургический этап — до 5 лет при соблюдении рекомендаций врача.';
  return 'У меня нет точной информации по этому вопросу. Уточните, пожалуйста, у администратора по телефону ' + phone + '. Могу помочь оставить заявку на обратный звонок.';
}
function bookingReply(session, input) {
  let b = bookings.get(session);
  if (!b && !/запис|при[её]м|обратн.*звон|оставить заявку/i.test(input)) return null;
  if (!b) b = { stage: 'name' };
  else if (b.stage === 'name') { b.name = input.trim(); b.stage = 'service'; }
  else if (b.stage === 'service') { b.service = input.trim(); b.stage = 'time'; }
  else if (b.stage === 'time') { b.time = input.trim(); b.stage = 'phone'; }
  else if (b.stage === 'phone') {
    const match = input.match(/\+?[\d\s()\-]{10,}/);
    b.phone = match ? match[0].trim() : 'не указан';
    b.stage = 'confirm';
  }
  else if (b.stage === 'confirm') {
    if (/да|верно|подтвержда/i.test(input)) {
      requests.push({ name: b.name, phone: b.phone, service: b.service, time: b.time, createdAt: new Date().toISOString() });
      bookings.delete(session);
      return 'Спасибо! Заявка принята. Администратор свяжется с вами для подтверждения записи. Если вопрос срочный, позвоните по номеру ' + phone + '.';
    }
    bookings.delete(session);
    return 'Хорошо, заявку не сохраняю. Если захотите начать заново, напишите «хочу записаться».';
  }
  bookings.set(session, b);
  if (b.stage === 'name') return 'С удовольствием помогу оставить заявку. Как к вам обращаться?';
  if (b.stage === 'service') return 'Какую услугу вы хотели бы получить?';
  if (b.stage === 'time') return 'На какой день и время вам было бы удобно прийти?';
  if (b.stage === 'phone') return `Подтверждаю выбранные дату и время: ${b.time}. Оставьте, пожалуйста, телефон для связи на случай форс-мажорных изменений.`;
  return `Проверьте заявку:\nИмя: ${b.name}\nТелефон: ${b.phone}\nУслуга: ${b.service}\nДата и время: ${b.time}\n\nВсё верно? Ответьте «да», чтобы отправить заявку.`;
}
async function liveReply(messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(baseUrl + '/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.3, messages: [{ role: 'system', content: prompt }, ...messages] })
    });
    if (!response.ok) throw new Error('provider_error');
    const result = await response.json();
    const answer = result?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('empty_reply');
    return answer.trim();
  } finally { clearTimeout(timer); }
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { mode: key ? 'live' : 'demo' });
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 80000) return json(res, 413, { error: 'Сообщение слишком длинное.' }); }
    let body;
    try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'Не удалось прочитать сообщение.' }); }
    const messages = normalizeMessages(body?.messages);
    if (!messages) return json(res, 400, { error: 'Введите вопрос, чтобы продолжить.' });
    const session = typeof body.sessionId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(body.sessionId) ? body.sessionId : 'anonymous';
    const latest = messages.at(-1).content;
    const booking = bookingReply(session, latest);
    if (booking) return json(res, 200, { reply: booking, mode: key ? 'live' : 'demo' });
    if (!key) return json(res, 200, { reply: demoReply(latest), mode: 'demo' });
    try { return json(res, 200, { reply: await liveReply(messages), mode: 'live' }); }
    catch { return json(res, 200, { reply: demoReply(latest), mode: 'demo' }); }
  }
  if (req.method === 'GET') {
    const relative = url.pathname === '/' ? '/index.html' : url.pathname;
    const target = path.resolve(publicDir, '.' + relative);
    if (!target.startsWith(publicDir + path.sep)) return json(res, 404, { error: 'Страница не найдена.' });
    return sendFile(res, target);
  }
  return json(res, 405, { error: 'Метод не поддерживается.' });
});
server.listen(Number(process.env.PORT || 3000), host, () => console.log('LumiDent ready on http://' + host + ':' + (process.env.PORT || 3000)));

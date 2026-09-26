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
if (!process.env.DATABASE_URL && fs.existsSync('/etc/secrets/DATABASE_URL')) {
  const secretFile = fs.readFileSync('/etc/secrets/DATABASE_URL', 'utf8').trim();
  process.env.DATABASE_URL = (secretFile.match(/^DATABASE_URL=(.*)$/m)?.[1] || secretFile).replace(/^['"]|['"]$/g, '').trim();
}
const key = process.env.DEEPSEEK_API_KEY?.trim();
const baseUrl = (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const model = process.env.LLM_MODEL || 'deepseek-chat';
const host = process.env.HOST || '127.0.0.1';
const prompt = fs.readFileSync(path.join(root, 'SYSTEM_PROMPT.md'), 'utf8');
const bookings = new Map();
const requests = [];
const phone = '+7 (495) 123-45-67';
const localClinicKnowledge = {
  hours: 'Ежедневно, 09:00–21:00', hours_en: 'Daily, 09:00–21:00',
  services: [
    ['Консультация', 'Знакомство с врачом и план лечения.', 'Consultation', 'Meet the dentist and discuss a treatment plan.', 1500],
    ['Профессиональная гигиена', 'Профессиональная чистка зубов.', 'Professional cleaning', 'Professional teeth cleaning.', 5500],
    ['Лечение кариеса', 'Лечение кариеса после осмотра.', 'Cavity treatment', 'Cavity treatment after an examination.', 7000],
    ['Лечение одного канала', 'Эндодонтическое лечение.', 'Root canal treatment', 'Endodontic treatment.', 9000],
    ['Винир', 'Эстетическое восстановление зуба.', 'Veneer', 'Aesthetic restoration of a tooth.', 35000],
    ['Коронка из диоксида циркония', 'Ортопедическое восстановление.', 'Zirconia crown', 'Prosthetic restoration.', 45000],
    ['Имплантация одного зуба', 'Имплантация после диагностики.', 'Single-tooth implant', 'Dental implant placement after diagnostics.', 85000],
    ['Удаление зуба', 'Удаление по показаниям врача.', 'Tooth extraction', 'Extraction when clinically indicated.', 4000],
    ['Отбеливание', 'Профессиональное отбеливание.', 'Teeth whitening', 'Professional teeth whitening.', 18000]
  ].map(([name, description, name_en, description_en, price_from], id) => ({ id: id + 1, name, description, name_en, description_en, price_from }))
};
const monthNames = { января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5, июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11 };

function normalizeTimePreference(input) {
  const text = input.trim().toLowerCase();
  const dayMatch = text.match(/(?:^|\D)(\d{1,2})(?:-?го|-?е)?(?:\s+(?:числа|день))?/);
  const hourMatch = text.match(/на\s*(\d{1,2})/) || text.match(/(?:в\s*)?(\d{1,2})\s*(?:ч|час(?:а|ов)?)/);
  if (!dayMatch) return input.trim();
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const monthMatch = Object.keys(monthNames).find(name => text.includes(name));
  if (monthMatch) month = monthNames[monthMatch];
  const day = Number(dayMatch[1]);
  if (!monthMatch && new Date(year, month, day) < new Date(year, month, now.getDate())) month += 1;
  if (month > 11) { month = 0; year += 1; }
  const hour = hourMatch && Number(hourMatch[1]) <= 23 ? Number(hourMatch[1]) : null;
  const date = `${String(day).padStart(2, '0')}.${String(month + 1).padStart(2, '0')}.${year}`;
  return hour === null ? date : `${date} в ${String(hour).padStart(2, '0')}:00`;
}

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
function demoReply(input, locale = 'ru') {
  const q = input.toLowerCase();
  if (locale === 'en') {
    if (/cavity|caries/.test(q)) return 'Cavity treatment starts at 7,000 ₽. The exact cost is determined by the dentist after an examination and diagnostics.';
    if (/hour|open|working|time/.test(q)) return 'The clinic is open daily from 09:00 to 21:00 (Moscow time).';
    if (/fill|material|warrant|guarantee/.test(q)) return 'Filling materials include 3M and Tokuyama. Fillings are covered for up to 2 years; exact terms depend on the treatment and the dentist’s recommendations.';
    if (/parking|park/.test(q)) return 'I do not have confirmed information about parking. Please check with the clinic at +7 (495) 123-45-67.';
    if (/super.?glue|glue|reattach/.test(q)) return 'Please do not use superglue in your mouth. It can injure tissue and complicate treatment. Contact a dentist promptly.';
    if (/borscht|weather|football|exchange rate/.test(q)) return 'I can help with questions about LumiDent, dentistry, services, prices, materials, and opening hours.';
    return 'I do not have confirmed information about that. Please contact the clinic at +7 (495) 123-45-67.';
  }
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
  else if (b.stage === 'time') { b.time = normalizeTimePreference(input); b.stage = 'phone'; }
  else if (b.stage === 'phone') {
    const match = input.match(/\+?[\d\s()\-]{9,}/);
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
async function liveReply(messages, locale = 'ru') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(baseUrl + '/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.3, messages: [{ role: 'system', content: locale === 'en' ? prompt.replace('Отвечай по-русски, доброжелательно и профессионально.', 'Отвечай доброжелательно и профессионально на английском языке.') : prompt }, ...messages] })
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
  if (req.method === 'GET' && url.pathname === '/api/knowledge') return json(res, 200, localClinicKnowledge);
  if (req.method === 'GET' && url.pathname === '/api/auth/me') return json(res, 200, { user: null });
  if (req.method === 'POST' && url.pathname === '/api/auth/login') return json(res, 503, { error: 'Вход администратора доступен после подключения базы данных.' });
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 80000) return json(res, 413, { error: 'Сообщение слишком длинное.' }); }
    let body;
    try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'Не удалось прочитать сообщение.' }); }
    const messages = normalizeMessages(body?.messages);
    if (!messages) return json(res, 400, { error: 'Введите вопрос, чтобы продолжить.' });
    const locale = body.locale === 'en' ? 'en' : 'ru';
    const latest = messages.at(-1).content;
    if (!key) return json(res, 200, { reply: demoReply(latest, locale), mode: 'demo' });
    try { return json(res, 200, { reply: await liveReply(messages, locale), mode: 'live' }); }
    catch { return json(res, 200, { reply: demoReply(latest, locale), mode: 'demo' }); }
  }
  if (req.method === 'GET') {
    const relative = url.pathname === '/' || url.pathname === '/user' ? '/index.html' : url.pathname === '/admin' ? '/pro.html' : url.pathname;
    const target = path.resolve(publicDir, '.' + relative);
    if (!target.startsWith(publicDir + path.sep)) return json(res, 404, { error: 'Страница не найдена.' });
    return sendFile(res, target);
  }
  return json(res, 405, { error: 'Метод не поддерживается.' });
});
if (process.env.DATABASE_URL) {
  const { startProServer } = await import('./pro-server.js');
  await startProServer({ host, port: Number(process.env.PORT || 3000), publicDir, baseUrl, model, key, prompt });
} else {
  server.listen(Number(process.env.PORT || 3000), host, () => console.log('LumiDent prototype ready on http://' + host + ':' + (process.env.PORT || 3000)));
}

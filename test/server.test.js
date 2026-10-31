import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

let serverProcess;
let baseUrl;

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: '', DEEPSEEK_API_KEY: '' },
    stdio: 'ignore'
  });

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`Test server exited with code ${serverProcess.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/status`);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  serverProcess.kill();
  throw new Error('Test server did not start in time');
});

after(() => {
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
});

async function ask(question, locale = 'ru') {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: question }], locale })
  });
  return { response, body: await response.json() };
}

test('visitor route opens a guest chat without sign-in or registration', async () => {
  const response = await fetch(`${baseUrl}/user`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /id="chat-form"/);
  assert.match(html, /id="service-search"/);
  assert.match(html, /type="module" src="\/app\.js"/);
  assert.doesNotMatch(html, /register|sign in|войти|регистрац/i);

  const searchScript = await fetch(`${baseUrl}/service-search.js`);
  assert.equal(searchScript.status, 200);
  assert.match(await searchScript.text(), /export function matchesServiceQuery/);
});

test('administrator route is separate and offers no public registration', async () => {
  const response = await fetch(`${baseUrl}/admin`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /id="auth-form"/);
  assert.doesNotMatch(html, /register|регистрац/i);
});

test('public knowledge contains Russian and English clinic information', async () => {
  const response = await fetch(`${baseUrl}/api/knowledge`);
  const knowledge = await response.json();
  assert.equal(response.status, 200);
  assert.equal(knowledge.services.length, 9);
  assert.equal(knowledge.hours, 'Ежедневно, 09:00–21:00');
  assert.equal(knowledge.hours_en, 'Daily, 09:00–21:00');
  assert.ok(knowledge.services.every(service => service.name_en && service.description_en));
});

test('local speech route reports engine status and rejects malformed audio', async () => {
  const status = await fetch(`${baseUrl}/api/voice/status`);
  const voice = await status.json();
  assert.equal(status.status, 200);
  assert.equal(voice.engine, 'whisper.cpp');
  assert.equal(voice.model, 'tiny');
  assert.equal(typeof voice.available, 'boolean');

  const invalid = await fetch(`${baseUrl}/api/transcribe?locale=ru`, {
    method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: Buffer.from('not-a-wave-file')
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, 'voice_invalid_audio');

  const silence = Buffer.alloc(44 + 16000 * 2);
  silence.write('RIFF', 0); silence.writeUInt32LE(silence.length - 8, 4); silence.write('WAVEfmt ', 8);
  silence.writeUInt32LE(16, 16); silence.writeUInt16LE(1, 20); silence.writeUInt16LE(1, 22);
  silence.writeUInt32LE(16000, 24); silence.writeUInt32LE(32000, 28); silence.writeUInt16LE(2, 32);
  silence.writeUInt16LE(16, 34); silence.write('data', 36); silence.writeUInt32LE(32000, 40);
  const emptySpeech = await fetch(`${baseUrl}/api/transcribe?locale=ru`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: silence });
  assert.equal(emptySpeech.status, 200);
  assert.equal((await emptySpeech.json()).transcript, '');
});

test('fallback answers the five acceptance scenarios safely', async t => {
  const cases = [
    ['cavity-treatment price', 'Сколько стоит лечение кариеса?', /7 000 ₽/],
    ['opening hours', 'Во сколько работает клиника?', /09:00 до 21:00/],
    ['off-topic question', 'Как приготовить борщ?', /вопросами о стоматологии/],
    ['unknown information', 'Есть ли парковка?', /нет точной информации/],
    ['unsafe prompt', 'Можно приклеить зуб суперклеем?', /не приклеивайте зуб суперклеем/i]
  ];
  for (const [name, question, expected] of cases) {
    await t.test(name, async () => {
      const { response, body } = await ask(question);
      assert.equal(response.status, 200);
      assert.match(body.reply, expected);
      assert.equal(body.mode, 'demo');
    });
  }
});

test('English locale returns an English answer', async () => {
  const { response, body } = await ask('How much does cavity treatment cost?', 'en');
  assert.equal(response.status, 200);
  assert.match(body.reply, /starts at 7,000 ₽/);
});

test('empty or malformed chat input returns a readable 400 instead of crashing', async () => {
  const empty = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [] })
  });
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /Введите вопрос/);

  const malformed = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json'
  });
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error, /прочитать сообщение/);
});

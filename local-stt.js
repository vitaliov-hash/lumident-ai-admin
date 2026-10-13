import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(root, '.local-voice');
const executable = process.env.LUMIDENT_WHISPER_EXECUTABLE || path.join(assets, 'runtime', 'Release', 'whisper-cli.exe');
const model = process.env.LUMIDENT_WHISPER_MODEL || path.join(assets, 'ggml-tiny.bin');
const maxAudioBytes = 2 * 1024 * 1024;
let active = false;

function run(executablePath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, { windowsHide: true, shell: false, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('voice_timeout')); }, 90_000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('voice_unavailable')); });
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('voice_failed')); });
  });
}

export async function transcribeAudio(audio, locale) {
  if (!Buffer.isBuffer(audio) || audio.length < 44 || audio.length > maxAudioBytes || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE' || audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== 16000 || audio.readUInt16LE(34) !== 16 || audio.length > 960044) {
    const error = new Error('voice_invalid_audio'); error.status = 400; throw error;
  }
  if (active) { const error = new Error('voice_busy'); error.status = 429; throw error; }
  let energy = 0;
  for (let offset = 44; offset + 1 < audio.length; offset += 2) { const sample = audio.readInt16LE(offset) / 32768; energy += sample * sample; }
  if (Math.sqrt(energy / ((audio.length - 44) / 2)) < 0.003) return { transcript: '', language: locale === 'en' ? 'en' : 'ru' };
  active = true;
  const language = locale === 'en' ? 'en' : 'ru';
  const temp = await mkdtemp(path.join(os.tmpdir(), 'lumident-voice-'));
  const input = path.join(temp, 'recording.wav');
  const output = path.join(temp, 'transcript');
  try {
    await writeFile(input, audio, { mode: 0o600 });
    await run(executable, ['-m', model, '-f', input, '-l', language, '-oj', '-of', output, '-np', '-nt', '-ng', '-t', '4']);
    const result = JSON.parse(await readFile(`${output}.json`, 'utf8'));
    const transcript = (result.transcription || []).map(part => part.text || '').join('').trim().slice(0, 2000);
    return { transcript, language };
  } catch (error) {
    if (error.status) throw error;
    if (error.message === 'voice_timeout') { error.status = 504; throw error; }
    if (error.message === 'voice_failed') { error.status = 503; throw error; }
    const unavailable = new Error('voice_unavailable'); unavailable.status = 503; throw unavailable;
  } finally {
    try { await rm(temp, { recursive: true, force: true }); } finally { active = false; }
  }
}

export const voiceModelAvailable = async () => {
  const { access } = await import('node:fs/promises');
  try { await Promise.all([access(executable), access(model)]); return true; }
  catch { return false; }
};

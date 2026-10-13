import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The bundled local voice setup currently supports Windows x64.');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const voiceDir = path.join(root, '.local-voice');
const runtimeDir = path.join(voiceDir, 'runtime');
const modelFile = path.join(voiceDir, 'ggml-tiny.bin');
const archive = path.join(runtimeDir, 'whisper.zip');
const modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin';
const runtimeUrl = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip';
const runtimeSha256 = '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a';
const modelSha1 = 'bd577a113a864445d4c299885e0cb97d4ba92b5f';
const modelMaxBytes = 85_000_000;
const runtimeMaxBytes = 9_000_000;
const hash = (bytes, algorithm) => createHash(algorithm).update(bytes).digest('hex');

async function download(url, target, limit, algorithm, expected) {
  try { if (hash(await readFile(target), algorithm) === expected) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000), redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error('Voice component download failed.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > limit) throw new Error('Voice component exceeded its expected size.'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (hash(bytes, algorithm) !== expected) throw new Error('Voice component checksum mismatch.');
  const temporary = `${target}.download`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}

await mkdir(runtimeDir, { recursive: true });
await download(runtimeUrl, archive, runtimeMaxBytes, 'sha256', runtimeSha256);
await new Promise((resolve, reject) => {
  const child = spawn('tar.exe', ['-xf', archive, '-C', runtimeDir], { windowsHide: true, shell: false, stdio: 'ignore' });
  child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error('Unable to extract the verified voice runtime.')));
});
await download(modelUrl, modelFile, modelMaxBytes, 'sha1', modelSha1);
const executable = path.join(runtimeDir, 'Release', 'whisper-cli.exe');
try { await readFile(executable); } catch { throw new Error('The verified archive did not contain whisper-cli.exe.'); }
console.log('Local Russian/English Whisper tiny model is installed and checksum-verified.');

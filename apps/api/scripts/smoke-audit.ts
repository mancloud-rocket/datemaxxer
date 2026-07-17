/**
 * Smoke test del motor F1 contra la API real de Claude.
 * Genera 4 PNGs sintéticos (sin dependencias) y corre la auditoría completa.
 * Uso: pnpm tsx scripts/smoke-audit.ts   (requiere ANTHROPIC_API_KEY en el entorno o .env)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import Anthropic from '@anthropic-ai/sdk';
import { buildAuditEngine, claudeClientFromSdk } from '../src/engines/audit.js';

// Carga .env local si existe (sin dependencia dotenv)
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}

// --- Generador mínimo de PNG (color sólido, truecolor 8-bit) ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function solidPng(width: number, height: number, rgb: [number, number, number]): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // truecolor
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3)]);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

// --- Smoke test ---
const engine = buildAuditEngine({ client: claudeClientFromSdk(new Anthropic()) });

const photos = (
  [
    [200, 60, 40],
    [40, 120, 200],
    [40, 160, 90],
    [120, 120, 130],
  ] as Array<[number, number, number]>
).map((rgb) => ({ data: solidPng(64, 64, rgb), mediaType: 'image/png' as const }));

console.log('Corriendo auditoría F1 contra la API real (4 imágenes sintéticas)...');
const started = Date.now();
const result = await engine.run({
  photos,
  bio: 'me gusta viajar y el buen asado',
  region: 'rioplatense',
});
console.log(`OK en ${((Date.now() - started) / 1000).toFixed(1)}s. Resultado validado contra el contrato Zod:\n`);
console.log(JSON.stringify(result, null, 2));

/**
 * A/B del PASO 1 de F4 (extracción del chat) entre dos modelos.
 *
 * Para qué: el paso 1 pasó a un modelo chico (`CHAT_EXTRACCION_MODEL`, Haiku por
 * default) porque transcribir y separar quién dijo qué es trabajo mecánico y
 * cuesta cinco veces menos. El riesgo que eso abre es uno solo y hay que
 * medirlo: el campo `ts`. Una hora leída de menos no hace daño (queda en `null`
 * y `latenciasDeElla` saltea el mensaje). Una hora INVENTADA sí: produce una
 * latencia falsa, y sobre esa latencia el usuario decide qué hacer con una
 * persona real.
 *
 * Qué mide: corre la misma extracción con los dos modelos y compara cantidad de
 * mensajes, atribución (`de`) y timestamps.
 *
 * Qué NO mide: cuál de los dos tiene razón. No hay ground truth acá, el modelo
 * grande no es la verdad. Lo que esto da es dónde mirar: donde los dos
 * coinciden podés estar tranquilo, donde difieren abrí la captura y fijate.
 *
 * Solo se paga la llamada del paso 1. El paso 2 se responde con un stub, así que
 * el veredicto que sale es de mentira y no hay que leerlo.
 *
 * Uso:
 *   pnpm tsx scripts/ab-extraccion.ts <carpeta-con-capturas> [modeloA] [modeloB]
 *
 * Ejemplo:
 *   pnpm tsx scripts/ab-extraccion.ts ../../fixtures/chat
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { buildChatEngine } from '../src/engines/chat.js';
import { claudeClientFromSdk, type ClaudeClient } from '../src/engines/audit.js';
import type { MensajeParseado } from '../src/engines/behavior.js';
import type { ProfilePhoto } from '../src/engines/profileread.js';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}

const [carpeta, modeloA = 'claude-opus-4-8', modeloB = 'claude-haiku-4-5-20251001'] =
  process.argv.slice(2);

if (carpeta === undefined) {
  console.error('Falta la carpeta con las capturas.\n  pnpm tsx scripts/ab-extraccion.ts <carpeta> [modeloA] [modeloB]');
  process.exit(1);
}
if (process.env.ANTHROPIC_API_KEY === undefined) {
  console.error('Falta ANTHROPIC_API_KEY (en el entorno o en apps/api/.env).');
  process.exit(1);
}

const MEDIA: Record<string, ProfilePhoto['mediaType']> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const capturas: ProfilePhoto[] = readdirSync(carpeta)
  .filter((f) => MEDIA[extname(f).toLowerCase()] !== undefined)
  .sort()
  .map((f) => ({
    mediaType: MEDIA[extname(f).toLowerCase()]!,
    data: readFileSync(join(carpeta, f)).toString('base64'),
  }));

if (capturas.length === 0) {
  console.error(`No encontré imágenes en ${carpeta}`);
  process.exit(1);
}

/** Respuesta de mentira para el paso 2: acá solo importa el paso 1. */
const STUB_PASO2 = {
  registro_detectado: { formalidad: 'baja', mayusculas: false, emojis: 'pocos', humor: 'seco' },
  sugerencias: [{ estrategia: 'esperar', texto: 'stub', por_que: 'stub' }],
  veredicto: { decision: 'esperar', confianza: 0.5, evidencia: ['stub'], revisar_en_dias: 3 },
};

/**
 * Cliente que manda el paso 1 a la API de verdad y responde el paso 2 con el
 * stub. Así el script usa el motor real (mismo prompt, mismo schema, mismo
 * saneo de timestamps) sin pagar la segunda llamada ni duplicar código que
 * después se desincroniza.
 */
function clienteSoloPaso1(sdk: Anthropic): ClaudeClient {
  const real = claudeClientFromSdk(sdk);
  let llamada = 0;
  return {
    messages: {
      create: async (params) => {
        llamada += 1;
        if (llamada === 1) return real.messages.create(params);
        return { content: [{ type: 'text', text: JSON.stringify(STUB_PASO2) }], stop_reason: 'end_turn' };
      },
    },
  };
}

async function extraer(modelo: string): Promise<MensajeParseado[]> {
  const sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const engine = buildChatEngine({ client: clienteSoloPaso1(sdk), modelExtraccion: modelo });
  const salida = await engine.run({ capturas, region: 'rioplatense' });
  return salida.mensajes;
}

const minutos = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 60_000;

function comparar(a: MensajeParseado[], b: MensajeParseado[]): void {
  const n = Math.min(a.length, b.length);
  let mismaAtribucion = 0;
  let ambosConHora = 0;
  let horaIgual = 0;
  const discrepancias: string[] = [];

  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.de === y.de) mismaAtribucion += 1;
    if (x.ts !== null && y.ts !== null) {
      ambosConHora += 1;
      const delta = minutos(x.ts, y.ts);
      if (delta <= 1) horaIgual += 1;
      else discrepancias.push(`  #${i + 1} [${x.de}] "${x.texto.slice(0, 40)}" → ${modeloA}: ${x.ts} | ${modeloB}: ${y.ts} (${Math.round(delta)} min)`);
    }
  }

  const conHora = (ms: MensajeParseado[]) => ms.filter((m) => m.ts !== null).length;
  const pc = (x: number, total: number) => (total === 0 ? 'n/a' : `${Math.round((x / total) * 100)}%`);

  console.log(`\nCapturas: ${capturas.length}`);
  console.log(`Mensajes extraídos      ${modeloA}: ${a.length}   ${modeloB}: ${b.length}`);
  console.log(`Mensajes con hora       ${modeloA}: ${conHora(a)}   ${modeloB}: ${conHora(b)}`);
  console.log(`\nSobre los ${n} mensajes comparables:`);
  console.log(`  Misma atribución (yo/ella): ${mismaAtribucion}/${n} (${pc(mismaAtribucion, n)})`);
  console.log(`  Ambos leyeron hora:         ${ambosConHora}/${n}`);
  console.log(`  Y coincide (±1 min):        ${horaIgual}/${ambosConHora} (${pc(horaIgual, ambosConHora)})`);

  if (discrepancias.length > 0) {
    console.log(`\nHoras que no coinciden (${discrepancias.length}). Abrí la captura y fijate cuál tiene razón:`);
    for (const d of discrepancias) console.log(d);
  }

  console.log('\nCómo leerlo:');
  if (a.length !== b.length) {
    console.log(`  La cantidad de mensajes no coincide, así que la comparación por índice se desalinea después`);
    console.log(`  del primer salteo. Ese es el problema a mirar antes que las horas.`);
  }
  if (ambosConHora > 0 && horaIgual / ambosConHora < 0.9) {
    console.log(`  Menos del 90% de las horas coincide. NO mandes ${modeloB} a producción sin revisar esto:`);
    console.log(`  cada hora mal leída es una latencia falsa en el veredicto.`);
  } else if (ambosConHora > 0) {
    console.log(`  Las horas coinciden. ${modeloB} es seguro para la extracción en capturas como estas.`);
  } else {
    console.log(`  Ninguna captura mostraba hora en los dos modelos a la vez. Con este set no se puede`);
    console.log(`  concluir nada sobre timestamps: probá con capturas que sí tengan horas visibles.`);
  }
}

const a = await extraer(modeloA);
const b = await extraer(modeloB);
comparar(a, b);

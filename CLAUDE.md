# CLAUDE.md — Percentil

Copiloto de citas con IA. Spec completa en `docs/percentil-spec.md` — leela antes de tocar motores o prompts.

## Stack
- Monorepo pnpm: `apps/api` (Fastify+TS), `apps/mobile` (Expo), `apps/web` (Next.js), `packages/contracts` (Zod), `prompts/`
- Supabase (Postgres+Auth+Storage, RLS por user_id en todo; JWT verificado en la API con `jose` — JWKS o secret legacy). TODO en el schema `percentil`, nunca `public` (proyecto compartido); buckets prefijados `percentil-*`; clientes supabase-js con `db: { schema: 'percentil' }`.
- Claude API para motores (visión+texto), fal.ai para outpainting, sharp para pipeline de imagen
- Colas: BullMQ+Redis. Streaming: SSE.

## Reglas del proyecto (no negociables, están en la spec §2)
1. Los motores SÍ leen estilo de vida, estándar de plan y expectativa de inversión, sin eufemismos, cuando hay evidencia visible en la curaduría (siempre con `evidencia[]`). Lo que NUNCA infieren: disponibilidad sexual, orientación, salud. Esos campos → `null` + nota. Regla corta: se lee todo lo que ella eligió mostrar; no se adivina lo que no mostró.
2. Pipeline de fotos: la región de personas es intocable (máscara). Solo corrección técnica, color, encuadre, outpainting de entorno. Hay un test que lo asserta; no lo borres.
3. Sin APIs no oficiales de apps de citas. Input = screenshots/texto pegado, siempre.
4. Todo output de motor: JSON estricto validado con Zod desde `packages/contracts`. Todo claim con `evidencia[]` y `confianza`.
5. Cálculos de comportamiento (latencias, ratios) van EN CÓDIGO (`engines/behavior.ts`), el LLM solo interpreta.
6. Copy y sugerencias respetan `region` del usuario (rioplatense/chileno/mexicano/neutro) y la blocklist anti-slop (`prompts/shared/blocklist.txt`).

## Convenciones
- Prompts versionados en `/prompts/<motor>/system.md` + `schema.json` + `examples/`. Cambio de prompt = correr eval suite (`pnpm eval <motor>`) antes de mergear.
- Errores tipados, pino para logs, sin `console.log` en API.
- Tests: vitest. Los motores se testean con fixtures de screenshots en `fixtures/` (anonimizados).
- Identidad visual: tokens en la spec §1.3. El rojo permitido es SOLO el óxido `#C94B32`/`#8F2B22` (corrosión mate, red flags/sellos); prohibido el territorio Tinder (coral/rosa neón, gradientes calientes). Cyan `#4FD9C2` solo para acciones/soluciones. Mono: IBM Plex Mono.

## Comandos
- `pnpm dev` — api+web en watch
- `pnpm eval <motor>` — corre los casos dorados del motor contra el prompt actual
- `pnpm db:push` — migraciones Supabase

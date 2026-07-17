# Percentil

Copiloto de citas con IA. **El mercado está torcido. Movete de lugar.**

- Reglas del repo: [CLAUDE.md](CLAUDE.md)
- Spec completa: [docs/percentil-spec.md](docs/percentil-spec.md)

## Estructura

| Path | Qué es |
|---|---|
| `apps/api` | API Fastify+TS (monolito modular) |
| `apps/web` | Next.js — landing + auditoría gratuita |
| `apps/mobile` | Expo (vacía, Fase 3) |
| `packages/contracts` | Schemas Zod de los motores (§6) + fixtures |
| `prompts/` | Prompts versionados por motor (Fase 1+) |
| `supabase/` | Migraciones SQL + RLS + buckets |
| `fixtures/` | Screenshots anonimizados para tests de motores |

## Comandos

```bash
pnpm install
pnpm dev          # api (3001) + web (3000) en watch
pnpm typecheck    # todo el monorepo
pnpm test         # todo el monorepo
pnpm db:push      # migraciones Supabase (requiere supabase link)
```

La API necesita `.env` (ver `apps/api/.env.example`).

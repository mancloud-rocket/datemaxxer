# Bitácora de hardening — 16-ago-2026

Rama: `hardening/prod`. Protocolo: relevar primero, arreglar después, un commit
por arreglo con su verificación al lado. Este archivo se escribe a medida que
avanzo; si la sesión se corta, esto es lo que queda.

## Fase 0 — Línea de base

### Estado del repo al arrancar

- `main` en `cf2fda7`. Había trabajo verificado sin commitear (F4: extracción
  en Haiku + ventana de mensajes + saneo de timestamps, 359 tests verdes).
  Commiteado como `6a0ba86` en `hardening/prod` para que la base sea limpia.

### Build, tests, tipos

`pnpm verify` (typecheck + tests + build API + build web), corrido 16-ago:

- typecheck: limpio (3 paquetes)
- tests: **359 pasan, 0 fallan** (320 api + 39 contracts)
- build API (tsc): limpio
- build web (next build): limpio, 18 rutas

No hay script de lint en ningún paquete. No existe configuración de ESLint.
Anotado como observación, no lo agrego (sería tooling nuevo, no hardening).

### Auditoría de dependencias

`pnpm audit`: **22 vulnerabilidades (13 high, 9 moderate)**. Todas transitivas
o resolubles dentro del rango semver declarado:

| Paquete | Severidad | Vía | Arreglo |
|---|---|---|---|
| next 16.2.10 | 4 high + 4 mod | directo | 16.3.1 (minor, en rango ^16) |
| fast-uri | 2 high | fastify | update transitiva |
| sharp | 1 high | directo | update en rango |
| find-my-way | 1 high | fastify | fastify 5.12 (en rango ^5) |
| nanoid | 1 high | transitiva | update lockfile |
| postcss | 2 high + 2 mod | vitest/next (dev) | update lockfile |
| dompurify | 1 mod | posthog-js | posthog-js update en rango |

Mayores disponibles pero PROHIBIDAS por protocolo (no subir major): zod 3→4,
vitest 3→4, pino 9→10, @fastify/multipart 9→10, @fastify/rate-limit 10→11,
typescript 5→7, @types/node 22→26. Quedan documentadas, no se tocan.

Plan: `pnpm update -r` respetando rangos + re-audit + `pnpm verify` completo.

### Infraestructura desplegada (verificada por request real)

| Pieza | URL | Estado |
|---|---|---|
| API (Render free) | datemaxxer-api.onrender.com | 200 `{"status":"ok","contracts":"1.0"}` — tardó **51s** en despertar (cold start del plan free; primera visita del día espera ~1 min) |
| Landing | datemaxxer.vercel.app | 307 → `/cinema.html`, 200 |
| App (Next) | datemaxxer-app.vercel.app | 200 |

`ADMIN_PANEL_URL` default en `env.ts` dice `https://datemaxxer.vercel.app/admin`:
dominio y path equivocados (el panel vive en `datemaxxer-app.vercel.app/app/admin`).
Si Render no lo pisa con el valor bueno, el link del mail de aviso va a una 404.
→ ítem del plan.

### Recorrida por browser (Chrome real, sesión de la cuenta de prueba Alan Castro, plan Copilot + admin)

| Ruta | Estado | Observaciones |
|---|---|---|
| landing `/` → `/cinema.html` | 200 | Cinema scroll-driven responde, frames avanzan, 0 errores de consola |
| `/app` (Mi perfil) | 200 | Informe real renderizado (score 64), 0 errores, todos los requests 200 |
| `/app/radar` | 200 | Uploader visible, límite de 4 capturas comunicado |
| `/app/perfil` (F5) | 200 | Form completo: apps, verificado, bio |
| `/app/comparar` | 200 | Dos slots de foto + CTA |
| `/app/chats` | 200 | Lista con 1 conversación ("0 mensajes leídos") |
| `/app/fotos` (F2) | 200 | Uploader |
| `/app/bio` | 200 | Form de 3 datos + bio actual |
| `/app/coach` | 200 | Conversación real completa visible (el fix de CORS/streaming funciona en prod) |
| `/app/historial` | 200 | 7 auditorías listadas con scores y arquetipos |
| `/app/settings` | 200 | Región, nombre, cuentas vinculadas. Sin sección de upgrade porque esta cuenta ya es Copilot |
| `/app/admin` | 200 | 1 pedido pendiente (Kit US$19), 6 usuarios. No toqué Activar/Descartar |
| `/gap` sin params | 200 | Renderiza "0 puntos de distancia" con todo en cero: estado degenerado, no roto |

Cero errores de consola en todas las vistas. Cero requests fallidos.

### Verificaciones por curl

- **CORS**: origen `datemaxxer-app.vercel.app` recibe `access-control-allow-origin` correcto; un origen ajeno no recibe el header (bloqueado en browser). El fix de CORS está vivo en prod.
- **Auth**: `/me` y `/admin/usuarios` sin token → 401. Correcto.
- **EL HALLAZGO GRAVE**: los 3 CTAs de la landing desplegada apuntan a `/auditoria` → **404**. El repo tiene `href="/app"` → **también 404** en ese dominio, porque la app vive en otro proyecto de Vercel (`datemaxxer-app.vercel.app`) y no hay redirect. **Todo el funnel de conversión muere en el click.** Además la landing desplegada está desactualizada respecto del repo.

### Features en código vs UI

- Pedido de upgrade: conectado (botón "Quiero el Kit" en `Informe.tsx` → `pedirPlan` → mail + panel admin). OK.
- Legales (`docs/legal/*.md`): son drafts, no están linkeados en ningún lado. El login dice "aceptas los términos y la privacidad" sin link. → decisión pendiente (publicarlos requiere revisión legal).
- F6 (métricas): no construida, fuera de alcance de esta pasada.

## Plan priorizado

1. **[Funcionalidad] Funnel roto**: redirects en `landing/vercel.json` para `/app` y `/auditoria` → app real. El arreglo queda en el repo; el deploy de la landing depende de merge o deploy manual.
2. **[Funcionalidad] `ADMIN_PANEL_URL` default equivocado** en `env.ts`: apunta a dominio y path inexistentes; si Render no lo pisa, el link del mail de aviso de venta va a 404.
3. **[Seguridad] Dependencias**: `pnpm update -r` dentro de rangos semver → re-audit → `pnpm verify`. Debería resolver la mayoría de las 13 high.
4. **[Seguridad] Barrido de secretos** en repo y en el bundle del cliente.
5. **[Correctitud] `/gap` sin params**: mostrar estado neutral en vez de "0 puntos".
6. **[Performance] Lighthouse/PSI** en landing y app + tamaños de bundle. Solo medición.
7. **[Diseño] Responsive** 375/768/1440 en las vistas principales.

Prohibido tocar: precios, cupos, copy de producto, majors de dependencias.

## Ejecución

### 1. Funnel roto (commit `9639578`)

Qué era: los CTAs de la landing → 404 (detalle arriba). Qué se hizo: redirects
en `landing/vercel.json` para `/app`, `/app/:path*` y `/auditoria` hacia
`datemaxxer-app.vercel.app`. Verificación: deploy de PREVIEW en Vercel
(`datemaxxer-mfbszeg88-...`) y navegación real por Chrome: `/auditoria` en el
preview terminó en la app cargada. Prod NO tocado: promover es decisión de
Fernando (ver REPORTE).

### 2. `ADMIN_PANEL_URL` (commit `e28ea66`)

Default corregido a `https://datemaxxer-app.vercel.app/app/admin`. Verificado:
esa URL devuelve 200 por curl; el default viejo devolvía 404. Nota: si en
Render la variable está seteada con el valor viejo, hay que corregirla ahí
también; desde acá no se puede ver.

### 3. Dependencias (commit `5aa64c4`)

De 22 vulnerabilidades (13 high) a **cero**: `pnpm update -r` dentro de rangos
(next 16.3.1, fastify 5.12, etc.), ningún major. Verificado: `pnpm audit`
limpio + `pnpm verify` completo verde (359 tests, ambos builds).

### 4. Barrido de secretos (sin cambios; verificación)

- `.env` y `.env.local` ignorados por git (verificado con `git check-ignore`).
- `git grep` de patrones (`sk-ant-`, `whsec_`, `service_role`, JWTs, `re_...`)
  sobre el árbol: solo placeholders de `.env.example` y el nombre del rol de
  Postgres en migraciones. Limpio.
- Historial completo (`git log -S`): mismos placeholders. Limpio.
- **Bundle del cliente desplegado**: bajé los 12 chunks JS de
  `datemaxxer-app.vercel.app` (1.08 MB) y grepeé. Cero secretos; el único JWT
  embebido es la anon key de Supabase (`"role":"anon"`), pública por diseño.
- Endpoints sin token → 401 (verificado por curl arriba). CORS cerrado para
  orígenes ajenos (verificado por curl arriba).

### 5. `/gap` sin params (commit `6903386`)

Estado degenerado corregido; verificado contra `next start` local en los dos
estados (sin params y con `?d=23&c=14`).

### 6. Piso de legibilidad (commit `38fb646`) — pedido directo de Fernando

Ningún texto de la app baja de 12px; los plabels dejan de ser eyebrows y pasan
a títulos de sección legibles. Verificado por grep (no queda `font-size` menor
a `.75rem`) y visualmente pantalla por pantalla (ver punto 8).

### 7. Descriptividad de zonas de carga (commit `54b3829`)

Cada zona dice qué foto espera, de quién, cuántas y cómo (tocá/arrastrá).
Comparador rediseñado con el título adentro del hueco. Drag & drop agregado
donde faltaba (comparador, fotos, chats).

### 8. Verificación visual real + responsive (commit `83626f7`)

Cómo se verificó, porque acá está el valor:

- **Cuenta QA real** (`fernando.urbano+qa-hardening@rocketbot.com`, plan free)
  creada por vía administrativa y logueada en el build de producción local
  (`next start`) contra la API local y el Supabase real.
- Recorridas y capturadas: mesa, radar, leer-perfil, comparador, chats, fotos,
  bio, coach, settings. Tipografía nueva y textos nuevos confirmados en vivo.
- **Responsive medido, no asumido**: iframe de 375px y 768px dentro de Chrome,
  midiendo `scrollWidth` y enumerando todo elemento fuera del viewport, en 7
  combinaciones pantalla/ancho. Resultado final: cero desbordes.
- Dos bugs mobile encontrados y arreglados en el camino (ranuras que
  desbordaban por min-content; la franja de nav que ensanchaba la página
  entera y recortaba el contenido).

Nota de método: con la ventana de Chrome tapada, Windows le frena el
`requestAnimationFrame` y las animaciones GSAP quedan congeladas en las
capturas (sidebar "vacío"). No es un bug del código; el propio repo tiene
`?qa=1` para saltear la animación en QA. Documentado para la próxima.

### 9. HALLAZGO CRÍTICO SIN ARREGLAR: el login por mail está roto en prod

`POST /auth/v1/otp` de Supabase devuelve **500 "Error sending confirmation
email"** — reproducido por curl con la anon key, dos veces. Todo usuario que
intente entrar por correo ve "No pudimos mandar el código". Google OAuth
funciona (por eso nadie lo notó: la cuenta de prueba entra por Google).

Esto es del proyecto Supabase (SMTP), no del código: no se puede arreglar
desde el repo. Recomendación en el REPORTE.

### 10. Performance (medición parcial)

- Bundle JS de la web: 1.42 MB crudo total de chunks (los 3 mayores: 244,
  236 y 224 KB); se sirve comprimido por Vercel.
- PSI/Lighthouse: la API anónima de PageSpeed devolvió 429 (cuota agotada) y
  no hay Lighthouse instalado local. Queda como NO PUDE con el comando listo
  para correr cuando haya cuota.

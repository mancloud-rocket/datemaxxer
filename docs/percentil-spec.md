# PERCENTIL — Especificación completa del proyecto
**Versión 1.0 — Julio 2026 — Documento maestro para desarrollo en Claude Code**

---

## 0. Resumen ejecutivo

Copiloto de citas con IA para hombres en apps de dating (Tinder/Hinge/Bumble), mercado hispanohablante primero. No genera identidades falsas ni "rizz" genérico: audita el perfil como lo lee el algoritmo, define un arquetipo coherente, optimiza fotos reales, y funciona como copiloto de chat con triage de energía ("dónde invertir, dónde no").

**Tesis de mercado:** el match rate masculino promedio es ~2% vs ~44% femenino (SwipeStats, 294M swipes). La brecha entre cómo se puntúa a los hombres y a quiénes se les escribe demuestra que el perfil/señal importa más allá de la cara → hay margen optimizable → ese margen es el producto.

**Diferenciales vs mercado (YourMove, Rizz, Winggg):**
1. Español nativo con registro regional (rioplatense/chileno/mexicano), no traducción.
2. Motor de arquetipos (coherencia de perfil) — nadie lo tiene.
3. Triage de chats (asignación de energía) — nadie lo tiene.
4. "Mejoramos la foto, no te mejoramos a vos" — honestidad como diferencial vendible.
5. Sin API de Tinder: pipeline 100% screenshot/share-extension → cero riesgo ToS/baneo.

**Modelo:** pago único por paquete + upsell. Sin suscripción como default (el éxito del usuario = churn; la suscripción pelea contra el producto).

---

## 1. Identidad

### 1.1 Nombre
**Percentil** (primario).
- Es la palabra del propio mercado; el producto literalmente vende "moverte de percentil".
- Corto, pronunciable igual en toda LATAM y España, .com/.app disponibles a verificar.
- Alternativas de respaldo: **Remontar** (verbo, acción), **Señal** (lo que optimizamos), **Eje** (el arquetipo).

### 1.2 Slogan
Primario: **"El mercado está torcido. Movete de lugar."**
Secundarios por contexto:
- Landing/paid: "No podemos arreglar el mercado. Podemos moverte de lugar en él."
- App store: "Tu copiloto de citas. Datos, no humo."
- Chat copilot: "Invertí donde hay señal."

### 1.3 Identidad visual (heredada del landing ya construido)
| Token | Hex | Uso |
|---|---|---|
| `--void` | `#101318` | Fondo base |
| `--surface` | `#171B22` | Cards/paneles |
| `--line` | `#262C36` | Bordes/divisores |
| `--steel` | `#5B6672` | "Vos hoy" — estado frío, texto secundario |
| `--steel-dim` | `#333C47` | Puntos apagados, deshabilitado |
| `--oxide` | `#C94B32` | EL PROBLEMA — rojo óxido/corrosión: red flags, datos duros, grietas |
| `--stamp` | `#8F2B22` | Rojo profundo para sellos/stamps de expediente |
| `--sodium` | `#E8B04B` | Severidad media — ámbar, advertencias, veredictos `mantener`/`bajar_energia` |
| `--signal` | `#4FD9C2` | La solución/acción — SOLO para CTAs y veredictos positivos |
| `--ink` | `#E6E9ED` | Texto principal |
| `--ink-mute` | `#8C96A3` | Texto secundario |

Tipografías: **Archivo Black/900** (display, mayúsculas, tracking -0.035em) · **Inter Tight** (cuerpo) · **IBM Plex Mono** (datos, labels, eyebrows, sellos).
Elemento gráfico propio: el **sello de expediente** (texto mono en caja con borde `--stamp`, rotado 2-3 grados: "CASO 001", "RED FLAG DETECTADA", "SCORE 41/100").
Regla semántica: el color ES el argumento. Acero=estado actual, óxido=el problema/red flag, ámbar=advertencia media, cyan=solo cuando aparece la solución. El óxido `#C94B32` es rojo corrosión mate: queda PROHIBIDO el territorio Tinder (coral/rosa neón `#FD267D`-`#FF6036` y cualquier gradiente caliente saturado).

Tono de copy: forense, seco, sin autoayuda. Números primero. Registro voseo neutro rioplatense con toggle regional (ver §5.6).

---

## 2. Propuesta de valor (jerarquía)

1. **Gancho gratuito (viral):** Auditoría de Arquetipo — subís tus 6 fotos + bio, recibís: score de coherencia, qué arquetipo estás transmitiendo sin querer, y el gap contra el que querés transmitir. Compartible como card.
2. **Core pago:** el Kit de Perfil — arquetipo elegido + plan de fotos + retoque honesto + bio por intención.
3. **Retención/upsell:** Copiloto de Chat — lectura de perfil ajeno, sugerencias con registro, triage de energía con veredicto.

Funciones adicionales:
- Generación de fotos en lugares/situaciones donde el usuario quiera estar.
- Modificación de cara/cuerpo (mandíbula, piel, peso). Solo mejora fotográfica
- Sugerir conexiones/conocidos y  puntos de contacto REALES (ver F5).
- ❌ Integración con APIs no oficiales de Tinder/Bumble/Hinge. Todo entra por screenshot o texto pegado.


---

## 3. Funciones — detalle de producto

### F1. Motor de Arquetipos (gancho + core)
**Input:** 4-9 fotos + bio actual + respuesta a "¿qué querés transmitir?" (opcional en la versión gratuita).
**Arquetipos v1 (8):** Viajero · Intelectual · Deportista · Creativo · Profesional/Status · Outdoor/Aventura · Social/Anfitrión · Calmado/Hogareño.
**Output (ver contrato JSON §6.1):**
- `arquetipo_detectado` con confianza + evidencia por foto ("foto 3 dice X, foto 5 contradice con Y").
- `score_coherencia` 0-100: qué tan legible es el perfil en 200ms.
- `gap_analysis`: si declaró arquetipo objetivo, distancia y plan para cerrarla.
- `plan_de_fotos`: qué foto sacar, cuál reemplazar, orden óptimo, y **brief de foto faltante** ("te falta una foto tipo: exterior, luz día, plano medio, haciendo la actividad X").
**Versión gratuita:** score + arquetipo detectado + 1 insight. **Pagada:** todo.

### F2. Estudio de Fotos (retoque honesto)
Operaciones permitidas, en pipeline:
1. **Corrección técnica:** exposición, balance de blancos, contraste, ruido, nitidez, recorte/enderezado.
2. **Colorimetría por arquetipo:** LUTs/presets propios por arquetipo (Viajero=cálido saturado, Profesional=frío limpio, etc.).
3. **Expansión de encuadre (outpainting) SOLO del entorno:** completar la Torre Eiffel cortada, extender cielo/fondo. Regla dura: la máscara de outpainting NUNCA toca la región de personas (detección de personas → zona bloqueada).
4. **Orden y selección:** ranking de las fotos según legibilidad del arquetipo + reglas empíricas (primera foto: cara visible, sin lentes de sol, sin grupo).
Prohibido en el pipeline (hard-coded, no configurable): warp/liquify facial o corporal, skin smoothing más allá de corrección de ruido, cambio de proporciones.

### F3. Bio por Intención
**Input:** arquetipo elegido + intención (relación / casual / abierto) + 3 datos reales del usuario (prompts guiados) + registro regional.
**Output:** 3 variantes de bio + respuestas a prompts de Hinge si aplica. Reglas anti-slop: sin listas de emojis, sin "amante de", sin clichés detectados contra blocklist, máximo 1 humor por bio, largo según plataforma.

### F4. Copiloto de Chat (el moat)
**Input:** screenshot(s) del chat (OCR + vision) o texto pegado. Se acumula historial por conversación (el usuario etiqueta "chat con A").
**Módulos:**
1. **Lectura de comportamiento** (determinística + LLM):
   - `latencia`: promedio y derivada (¿se agranda o achica entre sesiones?).
   - `ratio_esfuerzo`: caracteres/mensaje de ella vs usuario, preguntas hechas vs respondidas.
   - `reinicio`: quién reengancha tras silencios.
   - `profundidad`: ¿pregunta, comparte, o solo responde?
2. **Registro detectado:** formal↔nonchalant, uso de mayúsculas, emojis, velocidad, humor. El copiloto ADAPTA sus sugerencias a ese registro (incluye "arrancá sin mayúscula, ella escribe así").
3. **Sugerencias de respuesta:** 3 opciones con etiqueta de estrategia ("seguir el humor", "profundizar", "proponer salida"), NUNCA texto para copiar sin etiqueta — el objetivo es que aprenda el patrón.
4. **Veredicto (el feature estrella):** `invertir_mas` | `mantener` | `proponer_salida_ahora` | `bajar_energia` | `dejar_morir` — con evidencia ("su latencia se triplicó en 4 días y no hizo una pregunta en 12 mensajes").
   - El veredicto es falseable: la app pregunta a los 3-7 días "¿qué pasó?" → feedback loop → mejora del modelo.

### F5. Lectura de Perfil Ajeno
**Input:** screenshots del perfil de ella.
**Output (contrato §6.3):**
- `eje_declarado`: qué está optimizando/vendiendo (estética, aventura, intelecto, status, cuerpo, calidez) — leído de su curaduría consciente.
- `nivel_curaduria`: producido↔casual → expectativa de esfuerzo.
- `densidad_competitiva`: alta/media/baja → "tu mensaje genérico muere en el segundo 3, diferenciate por X".
- `intencion_declarada`: literal del texto cuando existe; `null` si no está — nunca inferida de fotos.
- `coherencia_texto_fotos`: cuando no coinciden, se reporta como dato.
- `ganchos[]`: puntos de contacto REALES (lugares, estudios, hobbies, referencias) + cómo usarlos sin sonar a stalker.
- `registro_sugerido`: cómo abrirle según su estilo de escritura si hay chat, o su curaduría si no.
- Todo output lleva `confianza` y `evidencia[]`. Sin campo de disponibilidad. La densidad competitiva ES la lectura correcta de esa señal.
- **v1.1 (Fase 1):** campo `expectativa_de_plan` — nivel + `evidencia[]` + `traduccion` cruda ("su perfil vende un estándar; 'unas birras' compite mal acá"). Lectura de estilo de vida/estándar de plan permitida SOLO con evidencia visible en la curaduría.
- **Tono "Sin Anestesia":** el copy de F1/F4/F5 es crudo y sin eufemismos por defecto — el roast más duro va contra el perfil del propio usuario. Crudo con el usuario, nunca cruel con ella (§9.3). Es capa de prompt, no cambia los contratos.

### F6. Métricas del usuario (retención honesta)
Dashboard: match rate antes/después (input manual semanal o screenshot de la pantalla de matches), tasa de respuesta a openers, chats→salidas. Es la prueba del "si no sube en 30 días, devolvemos la plata".

---

## 4. Arquitectura técnica

### 4.1 Diagrama de componentes

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENTES                                                   │
│  ├── App móvil (Expo/React Native, iOS + Android)           │
│  │     └── Share Extension (iOS) / Share Target (Android)   │
│  │         → recibe screenshot desde Tinder/Hinge/WhatsApp  │
│  └── Web app (Next.js) — landing + auditoría gratuita       │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTPS (REST + SSE para streaming)
┌──────────────▼──────────────────────────────────────────────┐
│  API (Node 20 + TypeScript + Fastify)  — monolito modular   │
│  ├── /auth        (Supabase Auth: email OTP + Apple/Google) │
│  ├── /audit       F1 arquetipos                             │
│  ├── /photos      F2 pipeline de fotos (jobs async)         │
│  ├── /bio         F3                                        │
│  ├── /chat        F4 copiloto (sesiones por conversación)   │
│  ├── /profile-read F5                                       │
│  ├── /metrics     F6                                        │
│  └── /billing     webhooks MercadoPago/Stripe/RevenueCat    │
└──────┬───────────────┬───────────────────┬──────────────────┘
       │               │                   │
┌──────▼─────┐  ┌──────▼────────┐  ┌───────▼─────────────────┐
│ Supabase   │  │ Workers (Bull │  │ Motores IA              │
│ Postgres   │  │ MQ + Redis)   │  │ ├── Claude API (vision  │
│ + Storage  │  │ fotos, OCR,   │  │ │   + texto): F1,F3,F4, │
│ + RLS      │  │ análisis batch│  │ │   F5, OCR de chats    │
│            │  │               │  │ ├── Img pipeline: sharp │
│            │  │               │  │ │   + modelo outpaint   │
│            │  │               │  │ │   (SDXL inpaint API   │
│            │  │               │  │ │   o fal.ai) c/ máscara│
│            │  │               │  │ │   de personas (YOLO)  │
│            │  │               │  │ └── LUTs propios (sharp)│
└────────────┘  └───────────────┘  └─────────────────────────┘
```

### 4.2 Decisiones y porqués
- **Monolito modular, no microservicios.** Un dev + Claude Code. Módulos = carpetas con contrato claro; se extraen después si hace falta.
- **Supabase**: ya lo conocés (proyecto JV), auth+storage+Postgres+RLS resuelto, tier gratis para MVP.
- **Expo + share extension**: el "realtime feel" sin API de Tinder. Flujo: screenshot → share → Percentil responde en <3s (streaming).
- **Claude API con visión** para todos los motores de análisis: un solo proveedor, prompts versionados en repo (`/prompts/*.md`), respuestas en JSON estricto validadas con Zod.
- **Fotos async con colas**: el retoque tarda 10-40s → job + push notification, nunca bloquear UI.
- **OCR de chats**: primero visión de Claude directa (lee screenshots de WhatsApp/Tinder bien); fallback Tesseract solo si costo lo exige.
- **SSE, no WebSockets**: streaming unidireccional de sugerencias alcanza y simplifica infra.

### 4.3 Costos estimados por acción (para pricing)
- Auditoría F1 (6 fotos + bio): ~$0.05-0.10 USD de API.
- Retoque F2 por foto: ~$0.02-0.06 (outpainting es lo caro).
- Turno de chat F4: ~$0.01-0.03.
→ Margen bruto >85% con los precios de §8.

---

## 5. Modelo de datos (Postgres/Supabase)

> Implementación (jul-2026): todas las tablas viven en el schema `percentil` (no `public`, el proyecto Supabase se comparte) y los buckets llevan prefijo `percentil-`. SQL canónico en `supabase/migrations/`.

```sql
-- usuarios: auth la maneja Supabase; esto es perfil de producto
create table profiles (
  id uuid primary key references auth.users,
  handle text,
  region text check (region in ('rioplatense','chileno','mexicano','neutro')) default 'neutro',
  intent text check (intent in ('relacion','casual','abierto')),
  target_archetype text,          -- arquetipo elegido
  plan text check (plan in ('free','kit','copilot')) default 'free',
  created_at timestamptz default now()
);

create table photo_sets (          -- un set = una auditoría
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles not null,
  status text check (status in ('uploaded','analyzing','done','error')) default 'uploaded',
  audit_result jsonb,              -- contrato §6.1 completo
  created_at timestamptz default now()
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references photo_sets not null,
  storage_path text not null,      -- original
  enhanced_path text,              -- resultado F2
  position int,                    -- orden sugerido
  analysis jsonb,                  -- lectura por foto (evidencia F1)
  enhance_ops jsonb                -- log de operaciones aplicadas (auditabilidad)
);

create table conversations (       -- F4: una por "chica"
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles not null,
  label text not null,             -- "A", "Flor Bumble", lo que ponga
  platform text,
  profile_read jsonb,              -- contrato §6.3 si subió el perfil (F5)
  behavior_state jsonb,            -- acumulado: latencias, ratios (§6.2)
  last_verdict text,
  verdict_feedback text,           -- "salió bien"/"no contestó más" → feedback loop
  created_at timestamptz default now()
);

create table chat_snapshots (      -- cada screenshot/pegado es un snapshot
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations not null,
  source text check (source in ('screenshot','pasted')),
  raw_storage_path text,           -- imagen si screenshot
  extracted jsonb not null,        -- mensajes parseados: [{from, text, ts_estimado}]
  analysis jsonb,                  -- salida F4 de este turno
  created_at timestamptz default now()
);

create table metrics_entries (     -- F6
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles not null,
  week date not null,
  swipes int, matches int, replies int, dates int,
  source text check (source in ('manual','screenshot')),
  unique(user_id, week)
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles not null,
  sku text not null,               -- 'kit' | 'copilot_pack_100' | 'copilot_monthly'
  provider text,                   -- 'mercadopago' | 'stripe' | 'apple' | 'google'
  amount_usd numeric,
  status text,
  created_at timestamptz default now()
);
-- RLS: todas las tablas con policy user_id = auth.uid()
```

---

## 6. Contratos JSON de los motores (validar con Zod, versionar)

### 6.1 F1 — AuditResult
```json
{
  "version": "1.0",
  "arquetipo_detectado": {"nombre": "viajero", "confianza": 0.72},
  "score_coherencia": 41,
  "lectura_200ms": "Tres señales distintas compitiendo: viaje, oficina, gimnasio.",
  "evidencia_por_foto": [
    {"foto": 1, "dice": "profesional", "señales": ["camisa","interior","luz fría"], "calidad_tecnica": 62}
  ],
  "gap_analysis": {"objetivo": "outdoor", "distancia": "alta", "acciones": ["..."]},
  "plan_de_fotos": {
    "conservar": [2,4], "reemplazar": [1,5],
    "orden_sugerido": [4,2,6,3],
    "briefs_faltantes": [
      {"tipo": "apertura", "specs": "exterior, luz día lateral, plano medio, cara visible, sin lentes, sin grupo"}
    ]
  },
  "quick_wins": ["..."]
}
```

### 6.2 F4 — ChatTurnAnalysis
```json
{
  "version": "1.0",
  "comportamiento": {
    "latencia_promedio_min": 47,
    "latencia_tendencia": "creciente",
    "ratio_esfuerzo": 0.4,
    "preguntas_ella_ultimos_10": 1,
    "reinicia_ella": false,
    "profundidad": "responde_solo"
  },
  "registro_detectado": {"formalidad": "baja", "mayusculas": false, "emojis": "pocos", "humor": "seco"},
  "sugerencias": [
    {"estrategia": "proponer_salida", "texto": "...", "por_que": "..."},
    {"estrategia": "profundizar", "texto": "...", "por_que": "..."}
  ],
  "veredicto": {
    "decision": "bajar_energia",
    "confianza": 0.66,
    "evidencia": ["latencia x3 en 4 días", "0 preguntas en 12 mensajes"],
    "revisar_en_dias": 4
  }
}
```

### 6.3 F5 — ProfileRead
```json
{
  "version": "1.0",
  "eje_declarado": {"principal": "aventura", "secundario": "estetica", "confianza": 0.7},
  "nivel_curaduria": "producido",
  "densidad_competitiva": {"nivel": "alta", "implicancia": "opener genérico muere; diferenciar por gancho concreto"},
  "intencion_declarada": null,
  "coherencia_texto_fotos": {"coincide": false, "nota": "bio dice tranqui, fotos dicen producción alta"},
  "ganchos": [
    {"tipo": "lugar", "dato": "foto en Torres del Paine", "uso": "pregunta específica del circuito W, no 'qué linda foto'"}
  ],
  "registro_sugerido": {"tono": "nonchalant", "evitar": ["formalidad","doble mensaje inicial"]},
  "disclaimer": "interpretación sobre curaduría pública; confianza indicada por campo"
}
```
Regla de motor transversal: **todo claim lleva evidencia y confianza; si no hay evidencia, el campo va `null`, nunca se inventa.**
Líneas rojas de inferencia (actualizado jul-2026): estilo de vida, estándar de plan y expectativa de inversión SÍ se leen (con evidencia visible). Disponibilidad sexual, orientación y salud NUNCA se infieren → `null` + nota.

---

## 7. Prompts (arquitectura, no el texto final — viven en `/prompts/`)

Estructura por motor: `system.md` (rol + reglas duras) + `schema.json` (contrato de salida) + `examples/` (few-shot) + `CHANGELOG.md`.

Reglas duras comunes (van en TODOS los system prompts):
1. Salida SOLO JSON válido contra el schema. Sin markdown, sin preámbulo.
2. Todo claim con `evidencia[]`; sin evidencia → `null`.
4. Registro de salida según `region` del usuario (léxico: rioplatense=vos/che, chileno=weón/cachai moderado, mexicano=tú/güey moderado, neutro=tú).
5. Anti-slop: blocklist de frases (`/prompts/shared/blocklist.txt`): "amante de", "vivir la vida", "sin drama", listas de emojis, "partner in crime".

Específicos:
- **F1** recibe las fotos como imágenes + bio como texto. Analiza foto por foto ANTES de sintetizar (chain: per-photo → síntesis).
- **F4** recibe: historial acumulado (`behavior_state`) + snapshot nuevo. El cálculo de latencias/ratios se hace EN CÓDIGO (determinístico, `src/engines/behavior.ts`), no en el LLM; el LLM interpreta y redacta.
- **F5** recibe screenshots del perfil. El prompt fuerza: "leés una curaduría consciente y pública; describís qué eligió mostrar, no quién es".

---

## 8. Pricing

| SKU | Precio | Incluye |
|---|---|---|
| **Gratis** | $0 | Auditoría F1 resumida (score + arquetipo + 1 insight) + card compartible |
| **Kit de Perfil** | USD 19 (one-time, precio LATAM; USD 29 España) | F1 completa + F2 hasta 8 fotos + F3 + 1 re-auditoría a los 30 días |
| **Copiloto pack** | USD 9 / 100 turnos | F4 + F5, consumible, sin vencimiento |
| **Copiloto mensual** | USD 12/mes | F4+F5 ilimitado "fair use" — solo para heavy users, no se empuja |

- Garantía: si el match rate no sube en 30 días (medido en F6), devolución del Kit. Es marketing y es presión de calidad interna.
- Cobro: **MercadoPago** (LATAM web), **Stripe** (España/resto), **RevenueCat** para IAP si Apple/Google lo exigen en el flujo móvil. Web-first checkout para esquivar el 30% donde se pueda (link out estilo post-2025 rules, verificar normativa vigente por país al implementar).

---

## 9. Marketing

### 9.1 Canal principal: TikTok/Reels orgánico
Formatos probados en el nicho:
1. **"El reparto"**: la grilla de 100 swipes del landing, animada, 15s. Hook: "esto es lo que pasa cuando 100 tipos y 100 minas swipean lo mismo".
2. **Auditorías en vivo** (con permiso, perfiles de amigos/seguidores): "leemos tu perfil como lo lee el algoritmo". CTA → auditoría gratis.
3. **"Percentil dice"**: casos anónimos del veredicto de chat ("la IA le dijo que deje morir este chat, mirá por qué").
4. Serie "datos que duelen": una estadística por video, estética forense del landing.

### 9.2 Funnel
```
TikTok → landing (ya construido) → auditoría gratis (email) →
card compartible (loop viral) → paywall Kit → post-Kit upsell Copiloto →
semana 4: pedido de métricas F6 → testimonio/refund
```
KPIs de funnel: CTR video→landing >1.5%, landing→auditoría >25%, auditoría→Kit >8%, Kit→Copiloto >30%.

### 9.3 Posicionamiento público
- Enemigo: el diseño del mercado/algoritmo. Nunca las mujeres. (Decisión comercial: el segmento blackpill no paga; el frustrado-que-pelea sí, y los ads de Meta no banean.)
- Bandera de honestidad: "mejoramos la foto, no te mejoramos a vos" / "ganchos reales, no vidas inventadas". Es diferencial, no disclaimer.

---

## 10. Roadmap de desarrollo (fases con tareas bajo nivel)

### Fase 0 — Infra (3-5 días)
- [ ] Monorepo pnpm: `apps/api`, `apps/mobile`, `apps/web`, `packages/contracts` (Zod schemas compartidos), `prompts/`
- [ ] Supabase: proyecto, tablas §5, RLS, storage buckets (`originals`, `enhanced`, `snapshots`) con políticas por user_id
- [ ] Fastify base: auth middleware (JWT Supabase), rate limiting, logging (pino), errores tipados
- [ ] CI: typecheck + test + deploy (Railway o Fly.io para API; Vercel para web)

### Fase 1 — Auditoría gratuita web (MVP de validación, 1-2 semanas)
- [ ] `apps/web`: Next.js, migrar el landing existente (`percentil-landing.html`) a componente
- [ ] Upload de 4-9 fotos + bio → `POST /audit` → job → resultado
- [ ] `src/engines/audit.ts`: llamada a Claude vision con prompt F1, validación Zod, retry con reparación de JSON
- [ ] Card compartible (og-image dinámica con el score) — el loop viral
- [ ] Captura de email antes del resultado
- **Gate de fase:** >25% de conversión landing→auditoría con tráfico de TikTok antes de construir lo pago.

### Fase 2 — Kit de Perfil (2-3 semanas)
- [ ] Checkout MercadoPago + Stripe (web), webhook → `purchases`
- [ ] `src/engines/photos.ts`: pipeline sharp (exposición/WB/crop) → detección de personas (YOLO via API o onnxruntime) → máscara → outpainting (fal.ai) SOLO fuera de la máscara → LUT por arquetipo
- [ ] Test duro del pipeline: assert de que la región de personas es bit-idéntica pre/post outpainting
- [ ] `src/engines/bio.ts` (F3) con blocklist anti-slop
- [ ] UI de resultado: comparador antes/después, orden sugerido drag&drop, briefs de fotos faltantes

### Fase 3 — App móvil + Copiloto (3-4 semanas)
- [ ] Expo app: auth, historial de conversaciones, cámara/galería
- [ ] Share extension iOS (`expo-share-extension`) + Android share target → `POST /chat/:id/snapshot`
- [ ] `src/engines/behavior.ts`: parser de mensajes desde visión → timestamps estimados → latencias/ratios EN CÓDIGO
- [ ] `src/engines/chat.ts` (F4): comportamiento + registro + sugerencias + veredicto, streaming SSE
- [ ] `src/engines/profileread.ts` (F5)
- [ ] Feedback loop: notificación a los N días del veredicto → "¿qué pasó?" → `verdict_feedback`
- [ ] F6 dashboard + entrada semanal

### Fase 4 — Optimización (continuo)
- [ ] Eval suite de prompts: 30 casos dorados por motor en `/prompts/*/examples`, corridos en CI contra cambios de prompt
- [ ] A/B de arquetipos y de veredictos contra `verdict_feedback`
- [ ] Regionalización léxica fina (chileno/mexicano nativos revisan)

---

## 11. Riesgos
| Riesgo | Mitigación |
|---|---|
| Hinge/Bumble lanzan lo mismo nativo | El copiloto de chat multi-app + español nativo no lo pueden copiar rápido; velocidad |
| Detección de screenshots imposible de parsear (UI cambia) | Visión LLM es robusta a cambios de UI vs OCR por template |
| Costo de API se dispara | Contratos JSON cortos, caché de lecturas de perfil, límites por SKU |
| Apple rechaza por contenido dating | Categoría lifestyle/coaching; sin contenido sexual; precedente: YourMove/Rizz aprobadas |
| Acusación de "app para manipular" | Las líneas rojas §2 son públicas y de marketing; veredictos con evidencia |

---

## 12. Seed de CLAUDE.md (copiar a la raíz del repo)
Ver archivo adjunto `CLAUDE.md`.

---

## 13. Checklist de salida a producción (auditoría 2026-07-19)

Distinto del roadmap de §10 (ese es orden de construcción; esto es el gate de salida sobre
lo YA construido). Verificado con lectura de código y ejecución real, no solo documentación.
Actualizar esta sección a medida que se cierren ítems - no crear checklists nuevas sueltas.

### 🔴 Bloqueante (no debería salir sin esto)
| # | Qué falta | Dueño |
|---|---|---|
| 1 | Checkout real del Kit (US$19) - hoy es solo un botón, sin backend de cobro | CORE + Fernando (proveedor) |
| 2 | Términos y privacidad - no existen ni linkeados | Fernando (contenido) → FRONT maqueta |
| 3 | Home de `apps/web` es el placeholder de Fase 0, no el landing real | CORE + Fernando (arquitectura de dominio) |
| 4 | CORS abierto (`origin: true`) en la API si no se fija `CORS_ORIGINS` en prod | CORE |
| 5 | Voseo colado en `Mesa.tsx`/`Login.tsx` (reportado en AGENTS-LOG 2026-07-18 entrada m, sin ack de CORE aún) | CORE o FRONT, esperando definición |
| 6 | ~~CTA roto `/auditoria` en `landing/index.html`~~ | ✅ FRONT, 2026-07-19 |

### 🟡 Fuerte recomendación antes de lanzar
| # | Qué falta | Dueño |
|---|---|---|
| 7 | Sin pipeline de deploy - CI solo corre typecheck+test, nadie despliega automático | CORE + Fernando (hosting: Vercel/Railway/Fly) |
| 8 | Sin analytics ni error tracking (cero visibilidad de qué pasa en producción) | CORE |
| 9 | Rotar la API key de Anthropic - marcada "provisoria" en el `.env` local, no está en git pero mejor cerrarlo | Fernando |
| 10 | ~~Favicon + imagen OG~~ (falta robots.txt/sitemap, y `metadataBase` cuando se defina el dominio - ítem 3) | ✅ FRONT, 2026-07-19 |
| 11 | Respaldo real de los números del landing ("+2.500 usuarios", etc.) antes de correr pauta paga | Fernando |
| 12 | `apps/web` sin ningún test | CORE |

### 🟢 Puede esperar
| # | Qué falta | Dueño |
|---|---|---|
| 13 | Probar en un teléfono real (headless no simula viewport real) | Fernando + FRONT |
| 14 | ~~Activar Google como provider en Supabase Auth~~ | ✅ Fernando, 2026-07-19 - falta que CORE verifique login real en `Login.tsx` |
| 15 | Assets de landing pesan 103MB en el repo - no bloquea nada, pero conviene tenerlo en el radar | Nadie urgente |

Lo ya sólido y verificado (no solo documentado): rate limiting real y testeado, auth JWT real
con chequeo de ownership, RLS completo en Supabase, 43/43 tests pasando, flujo completo
Login → Mesa → Escáner → Informe corriendo contra la API real, no mockeado.

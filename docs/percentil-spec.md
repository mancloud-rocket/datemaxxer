# DATEMAXXER (ex PERCENTIL) - Especificación completa del proyecto
**Versión 2.0 - 1-ago-2026 - Documento maestro para desarrollo en Claude Code**

> **Qué cambió de v1.0 a v2.0 (revisión de producto, 1-ago-2026).** El producto dejó de
> ser un revisor de perfiles y pasó a ser un instrumento de posición de mercado. Concreto:
> F5 se reescribió a v2.0 con índice de atractivo, selectividad, volumen, probabilidad de
> respuesta y gap; se agregaron Radar y Comparador con contrato propio; el coach pasó a v2
> y puede decir verdades de mercado sin eufemismos; y el orden de construcción se reordenó
> por valor entregado, no por costo de implementación. El detalle de qué está construido
> hoy vive en `ESTADO.md`; el changelog de esta revisión está en §14.

---

## 0. Resumen ejecutivo

Copiloto de citas con IA para hombres en apps de dating (Tinder/Hinge/Bumble), mercado hispanohablante primero. No genera identidades falsas ni "rizz" genérico.

**Qué hace, en una línea:** le dice al usuario en qué escalón del mercado está parado, en qué escalón está ella, y cuáles de esos puntos puede recuperar. Después lo acompaña con el chat, el triage de energía y el coach.

**Tesis de mercado:** el match rate masculino promedio es ~2% vs ~44% femenino (SwipeStats, 294M swipes). La distribución del lado masculino es de cola larga: una minoría chica se lleva la mayor parte de los likes. Esa asimetría no se discute, se mide y se usa como instrumento. El margen optimizable existe (fotos, presentación, físico, legibilidad) y ese margen es el producto.

**Diferenciales vs mercado (YourMove, Rizz, Winggg):**
1. Español nativo con registro regional (rioplatense/chileno/mexicano), no traducción.
2. **Índice de atractivo desglosado y gap relativo.** Es el diferencial duro: los competidores venden retoque cosmético y evitan el diagnóstico. Nadie más te dice el número, ni el de ella, ni la distancia entre los dos.
3. Motor de arquetipos (coherencia de perfil). Nadie lo tiene.
4. Triage de chats (asignación de energía). Nadie lo tiene.
5. Sin API de Tinder: pipeline 100% screenshot/share-extension → cero riesgo ToS/baneo.

**Lo que reemplazó a "mejoramos la foto, no te mejoramos a vos":** esa bandera vendía que el problema era cosmético. El posicionamiento v2 es más duro y más honesto: **el retoque no mueve el número; la cara presentada bien, el físico y la calidad de las fotos sí.** El producto te dice cuánto de tu gap es recuperable y cuánto no.

**Modelo:** pago único por paquete + suscripción para el eje recurrente (Radar, F4, F5, coach). La suscripción ya no pelea contra el producto: el Radar es de uso diario y el coach es la razón para abrir la app un día sin auditorías. Sí exige cupos por plan desde el día uno (§8).

---

## 1. Identidad

### 1.1 Nombre
**Datemaxxer** es el nombre en producción (dominios, repo `datemaxxer-api`,
`datemaxxer.vercel.app`). **Percentil** quedó como nombre interno del schema de base y de
esta spec, y sigue siendo la mejor descripción de lo que hace el producto: mover de
percentil. La v2.0 refuerza esa lectura, porque ahora el percentil es literalmente el
output.

Nombre original y su racional (se conserva por si se revisa el naming):
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
| `--steel` | `#5B6672` | "Vos hoy" - estado frío, texto secundario |
| `--steel-dim` | `#333C47` | Puntos apagados, deshabilitado |
| `--oxide` | `#C94B32` | EL PROBLEMA - rojo óxido/corrosión: red flags, datos duros, grietas |
| `--stamp` | `#8F2B22` | Rojo profundo para sellos/stamps de expediente |
| `--sodium` | `#E8B04B` | Severidad media - ámbar, advertencias, veredictos `mantener`/`bajar_energia` |
| `--signal` | `#4FD9C2` | La solución/acción - SOLO para CTAs y veredictos positivos |
| `--ink` | `#E6E9ED` | Texto principal |
| `--ink-mute` | `#8C96A3` | Texto secundario |

Tipografías: **Archivo Black/900** (display, mayúsculas, tracking -0.035em) · **Inter Tight** (cuerpo) · **IBM Plex Mono** (datos, labels, eyebrows, sellos).
Elemento gráfico propio: el **sello de expediente** (texto mono en caja con borde `--stamp`, rotado 2-3 grados: "CASO 001", "RED FLAG DETECTADA", "SCORE 41/100").
Regla semántica: el color ES el argumento. Acero=estado actual, óxido=el problema/red flag, ámbar=advertencia media, cyan=solo cuando aparece la solución. El óxido `#C94B32` es rojo corrosión mate: queda PROHIBIDO el territorio Tinder (coral/rosa neón `#FD267D`-`#FF6036` y cualquier gradiente caliente saturado).

Tono de copy: forense, seco, sin autoayuda. Números primero. Registro voseo neutro rioplatense con toggle regional (ver §5.6).

---

## 2. Propuesta de valor (jerarquía)

1. **Gancho gratuito (viral):** Auditoría - subís tus fotos + bio, recibís tu **índice de atractivo** (F1b) y tu **score de coherencia** (F1), qué arquetipo estás transmitiendo sin querer, y un insight crudo. Compartible como card.
2. **Core pago:** el Kit de Perfil - índice completo con desglose de puntos recuperables, plan de fotos, retoque honesto, bio por intención.
3. **Retención/suscripción:** el Copiloto - lectura de perfil ajeno (F5), Radar de swipe, Comparador, triage de chats (F4) y coach.

Funciones adicionales:
- Generación de fotos en lugares/situaciones donde el usuario quiera estar.
- ❌ Modificación de cara/cuerpo (mandíbula, piel, peso). Solo mejora fotográfica.
- Sugerir conexiones/conocidos y puntos de contacto REALES (ver F5).
- ❌ Integración con APIs no oficiales de Tinder/Bumble/Hinge. Todo entra por screenshot o texto pegado.

### 2.1 Qué se lee y qué no (regla de motor transversal, v2.0)

**SÍ se infiere, siempre con `evidencia[]` y `confianza`:** nivel de atractivo, selectividad,
estilo de vida, estándar de plan y expectativa de inversión. Un motor que se guarda el
diagnóstico para no incomodar no sirve, y el usuario lo nota en el primer informe.

**NUNCA se infiere:** orientación, salud, y disponibilidad sexual como estado de la persona
("está para algo", "es fácil"). Los contratos son `.strict()` y hacen fallar el parse si el
motor inventa un campo así.

El corte no es de pudor, es de anclaje: esos tres claims no se pueden atar a evidencia
visible, así que el modelo los alucina siempre, y un solo claim alucinado convierte el
informe entero en horóscopo. Lo que sí se lee es **qué tono habilita su curaduría**, que es
otra cosa, se apoya en lo que ella publicó y vive en `Opener.licencia` (§6.3).

**Regla corta: se lee todo lo que ella eligió mostrar; no se adivina lo que no mostró.**

**Piso que no se toca:** si el sujeto aparenta ser menor, el motor no puntúa, no archiva y
devuelve `AnalisisRechazado` con `motivo: 'menor_aparente'`; la ruta responde 422. Es la
única línea del producto que puede terminar en un problema penal.


---

## 3. Funciones - detalle de producto

### F1. Motor de Arquetipos (gancho + core)
**Input:** 4-9 fotos + bio actual + respuesta a "¿qué querés transmitir?" (opcional en la versión gratuita).
**Arquetipos v1 (8):** Viajero · Intelectual · Deportista · Creativo · Profesional/Status · Outdoor/Aventura · Social/Anfitrión · Calmado/Hogareño.
**Output (ver contrato JSON §6.1):**
- `arquetipo_detectado` con confianza + evidencia por foto ("foto 3 dice X, foto 5 contradice con Y").
- `score_coherencia` 0-100: qué tan legible es el perfil en 200ms.
- `gap_analysis`: si declaró arquetipo objetivo, distancia y plan para cerrarla.
- `plan_de_fotos`: qué foto sacar, cuál reemplazar, orden óptimo, y **brief de foto faltante** ("te falta una foto tipo: exterior, luz día, plano medio, haciendo la actividad X").
**Versión gratuita:** score + arquetipo detectado + 1 insight. **Pagada:** todo.

### F1b. Índice de Atractivo propio (dependencia dura, nueva en v2.0)
**Qué es:** el mismo `IndiceAtractivo` de §6.3 aplicado al usuario. Devuelve `facial`,
`presentacion`, `produccion`, `global`, `bucket_global`, `margen` y `limitantes`.

**Por qué existe separado de F1:** `score_coherencia` mide **legibilidad**, no atractivo. Son
cosas distintas y confundirlas rompe el producto: un tipo puede tener 88 de coherencia y
estar en bucket `medio_bajo` de atractivo. Es coherente y no matchea, y hasta v1.0 el
producto no tenía cómo decírselo.

**Por qué es bloqueante:** el `gap` de F5, el `gap_delta` del Radar y el lado `usuario` del
Comparador necesitan el índice del usuario. Sin F1b, `gap` vuelve `null` en las tres
funciones y se cae la mitad del valor del producto.

**Costo de construirlo:** bajo. El contrato ya existe (`packages/contracts/src/market.ts`) y
el motor de F1 ya recorre las fotos una por una. Es agregar un bloque de salida a la
síntesis, no un motor nuevo. **Va primero en el roadmap (§10, Fase 1b).**

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
3. **Sugerencias de respuesta:** 3 opciones con etiqueta de estrategia ("seguir el humor", "profundizar", "proponer salida"), NUNCA texto para copiar sin etiqueta - el objetivo es que aprenda el patrón.
4. **Veredicto (el feature estrella):** `invertir_mas` | `mantener` | `proponer_salida_ahora` | `bajar_energia` | `dejar_morir` - con evidencia ("su latencia se triplicó en 4 días y no hizo una pregunta en 12 mensajes").
   - El veredicto es falseable: la app pregunta a los 3-7 días "¿qué pasó?" → feedback loop → mejora del modelo.

### F5. Lectura de Perfil Ajeno (v2.0 - el feature más potente del producto)
**Input:** screenshots del perfil de ella.
**Contrato:** §6.3, implementado en `packages/contracts/src/profile-read.ts` + `market.ts`.

v1.0 leía curaduría: qué eje declara, qué tan producida está, qué ganchos hay. Era correcto
y era la mitad de lo que hace falta. La pregunta que el usuario realmente se hace antes de
escribir es **"¿tengo chance acá o estoy perdiendo el tiempo?"**, y v1 no la contestaba.

**Bloque de mercado (nuevo en v2.0):**
- `indice`: atractivo 0-100 desglosado en `facial` (lo que ella no controla), `presentacion` (semi: peso, entrenamiento, arreglo, estilo) y `produccion` (calidad fotográfica, locaciones, señales de lifestyle: todo controlable). Más `global`, `bucket_global`, `margen` y `limitantes`.
- `selectividad`: baja/media/alta/muy_alta + `filtros_declarados[]` (altura, intención, verificación). Se lee de señales declaradas y de curaduría, no del atractivo solo: una mujer de bucket medio con bio llena de requisitos filtra más que una de bucket alto sin bio.
- `volumen_matches`: bajo/medio/alto/muy_alto + los `drivers` que lo empujan.
- `probabilidad_respuesta`: nivel + `vs_baseline` (multiplicador contra su promedio) + `palancas`.
- `gap`: `delta` entero + `tier` (el_arriba / paridad / ella_un_tier / ella_dos_tiers). `null` si el usuario no tiene F1b.
- `autenticidad`: genuino / dudoso / probable_no_genuino + `tipo_sospecha` (bot, vendedora_contenido, catfish, agencia, inactiva). En LATAM esto le ahorra más tiempo al usuario que cualquier gap. Se juzgan artefactos del perfil (marcas de agua, handles, linktree, patrones de sesión), nunca a la persona.
- `inversion`: perseguir / volumen_bajo_esfuerzo / oportunista / no_vale + `mensajes_antes_de_soltar`.
- `openers[]`: 1 a 4, cada uno con `tono`, `licencia`, `riesgo` y `por_que_funciona`.

**Bloque de curaduría (heredado de v1.0, sin cambios):** `eje_declarado`, `nivel_curaduria`,
`densidad_competitiva`, `intencion_declarada` (literal del texto o `null`, nunca inferida de
fotos), `coherencia_texto_fotos`, `expectativa_de_plan` con su traducción cruda ("su perfil
vende un estándar; 'unas birras' compite mal acá"), `ganchos[]`, `registro_sugerido`.

**Las cuatro decisiones que hacen que esto funcione y no sea un juguete:**

1. **Bucket primero, número después.** Un LLM al que le pedís "puntuá 0-100" devuelve 72
   para todo el mundo. Es el modo de falla más caro que tiene el feature: si el índice no
   discrimina, no hay producto. El motor elige primero un bucket de seis con definición
   escrita (`bajo` p0-20 ... `top` p95-100) y recién ahí afina dentro de ese rango. El
   contrato tiene un `superRefine` que hace fallar el parse si el score no cae en el rango
   de su bucket.
2. **El ancla anti-regresión.** Cada componente obliga al motor a escribir qué vería un
   bucket arriba y uno abajo. Forzarlo a describir los vecinos le impide quedarse en el
   medio por default. Sin `ancla`, el parse falla.
3. **El desglose no es cosmético.** Separar lo que ella no controla de lo que sí es lo que
   vuelve el número accionable: le dice al usuario si compite contra genética o contra una
   sesión de fotos. Es también lo que hace posible el Comparador (§3 F8).
4. **Los derivados se calculan en código.** `volumen_matches`, `probabilidad_respuesta` y
   `gap` los saca `engines/market.ts` con aritmética sobre los componentes percibidos. Misma
   regla que `behavior.ts` en F4. Un modelo que "estima 23% de respuesta" inventa; una
   función determinística sobre entradas graduadas es consistente, auditable y se recalibra
   cuando F6 mida resultados reales.

**Por qué la probabilidad es relativa y no absoluta:** un porcentaje absoluto es mentira con
cara de dato hasta que F6 mida su tasa real. `vs_baseline` (0 a 5, donde 1.0 es su promedio)
es honesto, es más útil para decidir y no envejece mal.

**El tono de los openers lo gatea el gap, no el humor del modelo.** El techo es
`sexual_indirecto`: insinuación y tensión, nunca explicitud. No es pudor, es conversión: un
mensaje explícito de un hombre por debajo del tier de ella es la forma más rápida de
comerse un unmatch, y el motor tiene que saberlo. Cada opener declara `licencia` (qué mostró
ella que habilita ese tono) y `riesgo` (probabilidad de unmatch inmediato). Sin licencia
visible, el tono baja solo.

**Costo y latencia:** cadena de dos pasos como F1. USD 0,06 a 0,12 por lectura. Exige cupo
por plan (§8).

**Tono "Sin Anestesia":** el copy de F1/F4/F5 es crudo y sin eufemismos por defecto. El
diagnóstico sobre ella es frío y con evidencia; el roast más duro sigue yendo contra el
perfil del propio usuario, porque es el único que puede cambiar algo. Es capa de prompt, no
cambia los contratos.

### F7. Radar de swipe (nuevo en v2.0)
**Input:** screenshot del perfil, en el momento del swipe.
**Contrato:** §6.4, implementado en `packages/contracts/src/radar.ts`.
**Output:** `IndiceRapido` (bucket + score + una línea), `gap_delta`, `probabilidad_respuesta`,
exactamente 3 openers, `veredicto` de una palabra, `alerta_autenticidad`, `ms_motor`.

**Presupuesto duro: una sola llamada de visión, sin cadena, menos de 5 segundos.** Todo lo
que agregue tokens de salida agrega latencia, y a los 8 segundos el usuario ya swipeó y el
producto no sirvió. Por eso el índice del Radar no lleva desglose ni anclas: sale más barato
y sale más impreciso, y el contrato lo declara con `precision: 'rapida'` en vez de fingir la
calidad de F5. La UI dice "estimación rápida" y ofrece el análisis completo: esa fricción
declarada es la conversión natural del Radar al Kit.

**Va a un modelo rápido y barato, no al modelo grande.** Con el modelo grande por swipe no
cierra ninguna cuenta. F5 y el Comparador se quedan con el grande porque ahí la calibración
importa y el usuario espera.

### F8. Comparador de atractivo (nuevo en v2.0)
**Input:** su mejor foto (o su auditoría archivada) + la foto de ella.
**Contrato:** §6.5, implementado en `packages/contracts/src/compare.ts`.

Es la función más compartible del producto y la que más rápido puede volverse un juguete
deprimente. Lo que la salva es `descomposicion`: el gap se parte en puntos **cerrables**
(producción, presentación, arreglo, encuadre) y **no cerrables** (rasgos), y cada acción del
plan viene con su ganancia en puntos y su plazo real (`hoy`, `semana`, `mes`, `trimestre`,
`año`), más un `techo_estimado` si ejecuta todo.

"Te separan 23 puntos" deprime y no vende nada. "De esos 23, 14 son tuyos y los cerrás en
seis semanas: fotógrafo, corte y bajar seis kilos; los otros 9 son cara y no se negocian" es
diagnóstico honesto **y** es literalmente el pitch del Kit. El contrato exige `plan` con al
menos una acción: un gap sin salida no se entrega.

Los pesos por componente difieren según el sujeto (en perfiles masculinos el peso se corre
de facial hacia presentación y señales de estatus). Viven en `engines/market.ts`.

### F9. Triage de bandeja (propuesta)
El usuario sube 8 o 10 screenshots de sus matches y recibe el ranking de a cuáles contestar
primero, cuáles son volumen y cuáles no vale abrir. Es Radar en lote, es barato sobre lo
mismo, y resuelve el problema real del tipo que ya tiene matches y los está trabajando todos
igual, que es la forma más común de desperdiciar los pocos que servían.

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
│  └── Web app (Next.js) - landing + auditoría gratuita       │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTPS (REST + SSE para streaming)
┌──────────────▼──────────────────────────────────────────────┐
│  API (Node 20 + TypeScript + Fastify)  - monolito modular   │
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

### 6.1 F1 - AuditResult
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

### 6.2 F4 - ChatTurnAnalysis
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

### 6.3 F5 - ProfileRead v2.0
Fuente de verdad: `packages/contracts/src/profile-read.ts` + `market.ts`. Fixture completo en
`packages/contracts/fixtures/profile-read.json`. Recortado acá por espacio:

```json
{
  "version": "2.0",
  "indice": {
    "facial": {
      "bucket": "muy_alto", "score": 84,
      "evidencia": ["simetría alta y rasgos definidos en las tres frontales", "..."],
      "ancla": {
        "un_bucket_arriba": "rasgos de nivel editorial, funciona sin producción ninguna",
        "un_bucket_abajo": "atractiva pero dependiente del ángulo, una sola frontal buena"
      },
      "confianza": 0.72
    },
    "presentacion": {"bucket": "alto", "score": 74, "evidencia": ["..."], "ancla": {"...": "..."}, "confianza": 0.65},
    "produccion": {"bucket": "muy_alto", "score": 88, "evidencia": ["..."], "ancla": {"...": "..."}, "confianza": 0.81},
    "global": 81, "bucket_global": "muy_alto", "margen": 8, "fotos_evaluadas": 5,
    "limitantes": ["ninguna foto casual sin producir, el piso real puede ser más bajo"]
  },
  "selectividad": {
    "nivel": "muy_alta",
    "filtros_declarados": ["no busco nada casual", "+180"],
    "evidencia": ["bio con dos requisitos explícitos", "perfil verificado"],
    "confianza": 0.78
  },
  "volumen_matches": {
    "nivel": "muy_alto",
    "drivers": ["bucket global muy_alto", "verificado", "capital, densidad alta"],
    "implicancia": "tu mensaje compite contra veinte del mismo día"
  },
  "probabilidad_respuesta": {
    "nivel": "baja", "vs_baseline": 0.45,
    "palancas": ["gancho de trekking real", "foto tuya de exterior arriba antes de escribir"],
    "confianza": 0.6
  },
  "gap": {
    "delta": 19, "tier": "ella_un_tier",
    "lectura": "está un escalón arriba, no dos: alcanzable, no con un mensaje tibio",
    "estrategia_implicada": "gancho específico y propuesta rápida; nada de charla de mantenimiento"
  },
  "autenticidad": {"veredicto": "genuino", "tipo_sospecha": null, "señales": ["..."], "confianza": 0.88},
  "inversion": {
    "veredicto": "oportunista",
    "resumen": "vale el intento por el gancho de montaña, pero no le dediques la semana",
    "evidencia": ["gap de 19 con selectividad muy alta", "..."],
    "mensajes_antes_de_soltar": 3, "confianza": 0.7
  },
  "eje_declarado": {"principal": "aventura", "secundario": "estetica", "confianza": 0.7},
  "nivel_curaduria": "producido",
  "densidad_competitiva": {"nivel": "alta", "implicancia": "opener genérico muere; diferenciar por gancho concreto"},
  "intencion_declarada": null,
  "coherencia_texto_fotos": {"coincide": false, "nota": "bio dice tranqui, fotos dicen producción alta"},
  "expectativa_de_plan": {"nivel": "alto", "evidencia": ["..."], "traduccion": "su perfil vende un estándar; 'unas birras' compite mal acá", "confianza": 0.66},
  "ganchos": [
    {"tipo": "lugar", "dato": "foto en Torres del Paine", "uso": "pregunta específica del circuito W, no 'qué linda foto'"}
  ],
  "registro_sugerido": {"tono": "nonchalant", "evitar": ["formalidad","doble mensaje inicial"]},
  "openers": [
    {
      "tono": "desafiante",
      "texto": "Tu perfil dice tranqui y tenés cinco fotos de producción. Una de las dos miente y quiero saber cuál.",
      "licencia": "la contradicción entre bio y fotos está declarada por ella",
      "riesgo": "medio",
      "por_que_funciona": "la obliga a justificarse en tono de juego; con selectividad muy alta el push-pull rinde más que el halago"
    }
  ],
  "disclaimer": "estimación de posición de mercado sobre lo que ella eligió publicar, no un juicio sobre la persona"
}
```

**Buckets (anclados a percentil del pool femenino de la plataforma en su ciudad):**
`bajo` p0-20 (score 0-19) · `medio_bajo` p20-40 (20-39) · `medio` p40-60 (40-59) ·
`alto` p60-80 (60-79) · `muy_alto` p80-95 (80-94) · `top` p95-100 (95-100).
Los rangos son exhaustivos y sin solapes, y hay test que lo verifica. El índice **no es "qué
tan linda es": es posición de mercado.** Esa diferencia es lo que lo hace defendible y
calibrable contra datos reales después.

### 6.4 Radar - RadarRead
Fuente de verdad: `packages/contracts/src/radar.ts`.

```json
{
  "version": "1.0",
  "indice": {
    "bucket": "alto", "score": 71,
    "lectura": "cara fuerte, producción media, compite bien sin ser top",
    "precision": "rapida", "confianza": 0.55
  },
  "gap_delta": 12,
  "probabilidad_respuesta": {"nivel": "media", "vs_baseline": 0.9, "palancas": ["..."], "confianza": 0.5},
  "openers": ["... exactamente 3, mismo shape que F5 ..."],
  "veredicto": "volumen_bajo_esfuerzo",
  "alerta_autenticidad": null,
  "ms_motor": 4200
}
```
`openers` es `.length(3)` exacto: más openers = más tokens = el Radar deja de ser Radar.
`precision` es literal `'rapida'`: el contrato no permite que el Radar se declare tan preciso
como F5. `ms_motor` se loguea siempre para vigilar el presupuesto de latencia.

### 6.5 Comparador - CompareResult
Fuente de verdad: `packages/contracts/src/compare.ts`.

```json
{
  "version": "1.0",
  "usuario": {
    "etiqueta": "usuario", "global": 58,
    "facial": {"...": "ComponenteIndice o null"},
    "presentacion": {"...": "..."}, "produccion": {"...": "..."},
    "fortaleza": "mirada y mandíbula sostienen la foto sin ayuda",
    "debilidad": "la ropa y el fondo la tiran abajo"
  },
  "objetivo": {"etiqueta": "objetivo", "global": 81, "...": "..."},
  "gap": {"delta": 23, "tier": "ella_un_tier", "lectura": "...", "estrategia_implicada": "..."},
  "descomposicion": {
    "cerrables": 14,
    "no_cerrables": 9,
    "plan": [
      {"accion": "foto con luz de día y fotógrafo, no selfie de espejo", "puntos": 7, "plazo": "semana"},
      {"accion": "corte de pelo y barba definida", "puntos": 4, "plazo": "semana"},
      {"accion": "bajar 6 kilos y sostenerlo", "puntos": 3, "plazo": "trimestre"}
    ]
  },
  "veredicto": "de los 23 puntos que te separan, 14 son tuyos y los cerrás en seis semanas; los otros 9 son cara y no se negocian",
  "techo_estimado": 72,
  "confianza": 0.63
}
```
`plan` tiene `.min(1)`: un gap sin salida no se entrega nunca.

### 6.6 Rechazo de análisis - AnalisisRechazado
Fuente de verdad: `packages/contracts/src/market.ts`.

```json
{
  "version": "2.0",
  "rechazado": true,
  "motivo": "menor_aparente",
  "detalle": "el sujeto aparenta ser menor de edad; no se puntúa ni se archiva"
}
```
Motivos: `menor_aparente` · `sin_persona_identificable` · `imagen_ilegible` · `no_es_un_perfil`.
La ruta responde **422** y el objeto es `.strict()`: no puede arrastrar scores adentro. El
motor corre este filtro **antes** de puntuar nada.

---

Regla de motor transversal: **todo claim lleva evidencia y confianza; si no hay evidencia, el campo va `null`, nunca se inventa.**
Líneas rojas de inferencia (actualizado ago-2026, ver §2.1): nivel de atractivo, selectividad, estilo de vida, estándar de plan y expectativa de inversión SÍ se leen, con evidencia visible. Orientación, salud y disponibilidad sexual como estado de la persona NUNCA se infieren; los contratos `.strict()` hacen fallar el parse si aparecen.

---

## 7. Prompts (arquitectura, no el texto final - viven en `/prompts/`)

Estructura por motor: `system.md` (rol + reglas duras) + `schema.json` (contrato de salida) + `examples/` (few-shot) + `CHANGELOG.md`.

Reglas duras comunes (van en TODOS los system prompts):
1. Salida SOLO JSON válido contra el schema. Sin markdown, sin preámbulo.
2. Todo claim con `evidencia[]`; sin evidencia → `null`.
4. Registro de salida según `region` del usuario (léxico: rioplatense=vos/che, chileno=weón/cachai moderado, mexicano=tú/güey moderado, neutro=tú).
5. Anti-slop: blocklist de frases (`/prompts/shared/blocklist.txt`): "amante de", "vivir la vida", "sin drama", listas de emojis, "partner in crime".

Específicos:
- **F1** recibe las fotos como imágenes + bio como texto. Analiza foto por foto ANTES de sintetizar (chain: per-photo → síntesis).
- **F1b** sale de la misma síntesis de F1: un bloque de salida más, no un motor nuevo.
- **F4** recibe: historial acumulado (`behavior_state`) + snapshot nuevo. El cálculo de latencias/ratios se hace EN CÓDIGO (determinístico, `src/engines/behavior.ts`), no en el LLM; el LLM interpreta y redacta.
- **F5** recibe screenshots del perfil. El prompt fuerza: "leés una curaduría consciente y pública; describís qué eligió mostrar, no quién es". Los derivados (`volumen_matches`, `probabilidad_respuesta`, `gap`) los calcula `src/engines/market.ts`, no el LLM.
- **Radar (F7)** va a modelo rápido y barato, una llamada, sin cadena. F5 y Comparador (F8) al modelo grande.

**Reglas de calibración (obligatorias en los prompts de F1b, F5, F7 y F8):**
6. **Bucket antes que número.** El motor elige primero la etiqueta de bucket contra su definición escrita y recién después afina el score dentro del rango. Nunca al revés. Temperatura 0.
7. **Ancla obligatoria** en cada componente: qué vería un bucket arriba y uno abajo. Es lo que abre la distribución; sin ancla el parse falla.
8. **Prohibido devolver `global`, `volumen_matches`, `probabilidad_respuesta` o `gap`.** Los calcula el código. Si el modelo los emite, el `.strict()` rechaza la respuesta.
9. **Filtro de `menor_aparente` antes de puntuar.** Si aplica, el motor devuelve `AnalisisRechazado` y no emite ningún score.
10. **Tono de opener gateado por el gap**, con `licencia` citada. Techo `sexual_indirecto`; sin licencia visible el tono baja solo.

**Coach (v2, `prompts/coach/system.md`).** No sigue el contrato JSON: es conversacional y va en streaming. Sus reglas duras están en el propio prompt. Lo que cambió en v2:
- Vocabulario de terapia prohibido explícitamente ("sanar", "tu proceso", "validarte", preguntas de consultorio). No consuela: explica.
- Sección "lo que SÍ podés decir sin rodeos" que **licencia claim por claim** las verdades de mercado: desbalance de la plataforma, cola larga de likes del lado masculino, selectividad femenina alta y racional, tendencia a apuntar hacia arriba, dominancia del atractivo físico sobre la bio, jerarquías visibles. Está escrita explícitamente porque **un modelo al que no le licenciás el claim, lo hedgea**: sin esa lista el coach vuelve solo al registro tibio en dos turnos.
- Cayó "el enemigo nunca son las mujeres". La reemplazó una regla de rendimiento: **todo termina en algo que él controla.** El coach puede decir que el juego está torcido, cuánto y por qué; lo que no hace es cerrar ahí. El motivo no es de tono: un usuario convencido de que nada de lo que haga importa deja de sacarse fotos, deja de escribir y se da de baja. La retención se pierde por el lado del fatalismo, no por el de la crudeza.
- Regla nueva de freno de acoso: no insistir después de un no, no buscarla fuera de la app, no rastrear otras redes. Es riesgo de marca, no cortesía.
- Se mantienen el piso de salud mental y "no prometés resultados".

---

## 8. Pricing

| SKU | Precio | Incluye |
|---|---|---|
| **Gratis** | $0 | Auditoría resumida (índice F1b + score + arquetipo + 1 insight) + card compartible |
| **Kit de Perfil** | USD 19 (one-time, precio LATAM; USD 29 España) | F1 + F1b completos + desglose de puntos recuperables + F2 hasta 8 fotos + F3 + 1 re-auditoría a los 30 días |
| **Copiloto pack** | USD 9 / 100 turnos | F4 + F5 + Radar, consumible, sin vencimiento |
| **Copiloto mensual** | USD 12/mes (a revisar, ver abajo) | F4 + F5 + Radar + Comparador + coach, con cupos |

- Garantía: si el match rate no sube en 30 días (medido en F6), devolución del Kit. Es marketing y es presión de calidad interna.
- Cobro: **MercadoPago** (LATAM web), **Stripe** (España/resto), **RevenueCat** para IAP si Apple/Google lo exigen en el flujo móvil. Web-first checkout para esquivar el 30% donde se pueda (link out estilo post-2025 rules, verificar normativa vigente por país al implementar). Estado actual: cobro manual con link de Mercado Pago y activación desde el panel de admin (decisión 27-jul, ver `ESTADO.md` §3.4).

### 8.1 La economía no cierra como está (revisión ago-2026)

Suscripción USD 12/mes con vida útil estimada de 2 meses = **LTV de suscripción USD 24**.
Contra eso: una lectura F5 cuesta 0,06 a 0,12 y el Radar está pensado para usarse **muchas
veces por sesión**. Un usuario intensivo funde el margen en una semana. El "ilimitado fair
use" de v1.0 era viable cuando el Copiloto era solo F4; con Radar deja de serlo.

Dos consecuencias, ninguna opcional:

1. **Cupos por plan desde el día uno**, en el mismo patrón atómico de Postgres que ya usa F1
   (creación + descuento con `for update`, probado contra la base real). No se agrega
   después: retrofitear cupos sobre un motor en producción es donde aparecen las carreras.
2. **Revisar el precio.** El Copiloto a 12 está subvaluado para ser la única herramienta de
   su tipo en la región. El Kit a 19 está bien como rampa. Si hay que subir uno solo, es la
   suscripción.

Y una decisión técnica que es de pricing tanto como de arquitectura: **el Radar va a modelo
barato**. Con el modelo grande por swipe no cierra ninguna cuenta.

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

### 9.3 Posicionamiento público (revisado ago-2026)

Hay que distinguir dos cosas que v1.0 mezclaba: **qué dice el producto puertas adentro** y
**qué dice la marca puertas afuera**. No son lo mismo y conviene que no lo sean.

**Puertas adentro (informes y coach): crudeza total.** Se nombran los ratios, la
selectividad, las jerarquías de atractivo y el gap sin eufemismos. Es lo que el usuario
compró y es lo que ningún competidor se anima a entregar.

**Puertas afuera (ads, TikTok, landing): el enemigo es el diseño del juego, no las
mujeres.** Esto se sostiene por dos razones prácticas, no morales:
1. **Los ads de Meta y TikTok banean** creativos que encuadran a las mujeres como el
   problema. Sin pauta no hay funnel, y el orgánico solo no escala.
2. **El segmento blackpill no paga.** Ya decidió que no hay nada que hacer, y eso es
   exactamente el perfil de quien no compra una herramienta de mejora. El que paga es el que
   sigue jugando.

La regla que hace convivir las dos: **diagnóstico crudo, salida concreta.** El producto
puede decirle a un tipo que está en el percentil 30 y que ella está en el 85; lo que no
hace nunca es cerrar sin decirle qué parte de esa distancia puede recuperar. Es la misma
regla 4 del coach y por el mismo motivo: el fatalismo no ejecuta y no renueva.

**Banderas de honestidad:** "te decimos en qué escalón estás y cuál de esos puntos
recuperás" / "ganchos reales, no vidas inventadas" / "el retoque no mueve el número".
Es diferencial, no disclaimer.

---

## 10. Roadmap de desarrollo (fases con tareas bajo nivel)

> **Reordenado en v2.0.** El criterio anterior era "primero lo que desbloquea cobrar".
> Sonaba prudente y ordenaba mal: F3 (bio) es lo más barato de construir y también lo que
> menos le importa a nadie, porque a nadie lo rechazan por la bio. El criterio nuevo es
> **valor entregado por semana de trabajo**, y eso pone el eje de mercado adelante de todo.
> Estado real de cada ítem: `ESTADO.md`.

### Fase 0 - Infra ✅ COMPLETA
- [x] Monorepo pnpm: `apps/api`, `apps/mobile`, `apps/web`, `packages/contracts`, `prompts/`
- [x] Supabase: proyecto, tablas §5, RLS, storage buckets con políticas por user_id
- [x] Fastify base: auth middleware (JWT Supabase), rate limiting, logging (pino), errores tipados
- [x] CI: typecheck + test en cada push; deploy automático (Render para API, Vercel para web)

### Fase 1 - Auditoría gratuita web ✅ COMPLETA
- [x] `apps/web`: Next.js, funnel Ingreso → Mesa → Escáner → Informe → Límite
- [x] Upload de 4-9 fotos + bio → `POST /audit` (202 + background) → `GET /audit/:id`
- [x] `src/engines/audit.ts`: Claude vision, cadena per-photo → síntesis, Zod + retry de reparación
- [x] Cupo atómico en Postgres, techo de tiempo, cosecha de auditorías colgadas
- [ ] **Card compartible (og-image dinámica)** - sigue sin construirse, ver Fase 3
- [x] Cuenta, planes, panel de admin, cobro manual

### Fase 1b - Índice de Atractivo propio ✅ **HECHA (1-ago-2026)**
- [x] Extender la síntesis de `engines/audit.ts` para emitir `IndiceAtractivo` del usuario
- [x] Reglas de calibración en el prompt (bucket antes que número, ancla obligatoria)
- [x] Persistir el índice en `photo_sets.audit_result` y exponerlo en `GET /me`
- [x] `engines/market.ts` con los derivados en código (adelanta la mitad de la Fase 2)
- [ ] **Pendiente: UI del índice** en el informe (va con el rediseño, no bloquea F5)
- [ ] **Pendiente y es el riesgo abierto: la eval suite.** Los tests verifican que el
      contrato haga cumplir la calibración; nadie verificó todavía que el modelo calibre
      bien contra fotos reales
- **Por qué primero:** sin índice del usuario no hay `gap`, y sin `gap` el Radar y el Comparador entregan la mitad de lo que prometen. Es el mejor valor/esfuerzo de toda la lista.

### Fase 2 - F5 v2.0, el eje del producto (1-2 semanas) ⬅️ **SIGUE ACÁ**
- [x] `src/engines/market.ts`: `global` ponderado + pesos por sujeto + `margen` + `bucketDe` (hecho en Fase 1b)
- [ ] Completar `market.ts` con los derivados que faltan: `volumen_matches`, `probabilidad_respuesta`, `gap`
- [ ] `src/engines/profileread.ts` (F5): cadena de dos pasos, Zod contra `ProfileRead` v2.0
- [ ] Filtro `menor_aparente` antes de puntuar → 422 con `AnalisisRechazado`
- [ ] Rutas `/profile-read` + cupo por plan (patrón atómico de F1)
- [ ] UI de informe de perfil ajeno
- [ ] Eval suite: casos dorados que verifiquen **distribución** del índice, no solo que parsee

### Fase 3 - Frecuencia y viralidad (1-2 semanas)
- [ ] Radar (F7): una llamada, modelo barato, presupuesto <5s, logueo de `ms_motor`
- [ ] Comparador (F8): reusa `market.ts`, agrega `descomposicion` y `techo_estimado`
- [ ] **Card compartible del gap del Comparador.** La card que se comparte no es la del arquetipo: un número contra otro número es contenido, un arquetipo es un test de Facebook
- [ ] Cupos y rate limits específicos del Radar

### Fase 4 - Cerrar la promesa del Kit (1-2 semanas)
- [ ] `src/engines/bio.ts` (F3) con blocklist anti-slop
- [ ] `src/engines/photos.ts`: pipeline sharp (exposición/WB/crop) + LUT por arquetipo
- [ ] Test duro del pipeline: assert de que la región de personas es bit-idéntica pre/post
- [ ] UI de resultado: comparador antes/después, orden drag&drop, briefs de fotos faltantes
- **Alternativa legítima mientras tanto:** recortar lo que promete la página de venta y mover el Kit al eje de mercado, que es lo que la gente en realidad quiere comprar. Cobrar por algo que no existe no es una opción.
- Outpainting (fal.ai + máscara YOLO) queda para después: es la parte cara y lenta.

### Fase 5 - El moat (2-3 semanas)
- [ ] `src/engines/behavior.ts`: parser de mensajes desde visión → timestamps estimados → latencias/ratios EN CÓDIGO
- [ ] `src/engines/chat.ts` (F4): comportamiento + registro + sugerencias + veredicto, streaming SSE
- [ ] Feedback loop: notificación a los N días del veredicto → "¿qué pasó?" → `verdict_feedback`
- **Por qué acá y no antes:** F4 sirve cuando ya conseguiste el match, y la mayoría de los usuarios se cae antes de eso. Además necesita conversaciones reales para calibrarse.

### Fase 6 - Producción seria (no negociable antes de tráfico pago)
- [ ] Legales publicados, tracking de errores, analítica de funnel
- [ ] Rotar credenciales, cerrar CORS
- [ ] Cupos por plan en todos los motores nuevos
- [ ] Home real de `apps/web` con el posicionamiento v2

### Fase 7 - App móvil y lo que sigue
- [ ] Expo app: auth, historial de conversaciones, cámara/galería
- [ ] Share extension iOS + Android share target → `POST /chat/:id/snapshot`
- [ ] Triage de bandeja (F9), simulador de conversación, post-mortem de cita, "el día siguiente"
- [ ] F6 dashboard + entrada semanal (necesita usuarios con historia para significar algo)

### Continuo - Optimización
- [ ] Eval suite de prompts: 30 casos dorados por motor en `/prompts/*/examples`, en CI
- [ ] **Recalibración del índice contra `verdict_feedback` y F6.** Es la razón por la que `probabilidad_respuesta` es relativa y los derivados están en código: el día que haya resultados reales, se ajusta la función, no el prompt
- [ ] Regionalización léxica fina (chileno/mexicano nativos revisan)

---

## 11. Riesgos
| Riesgo | Mitigación |
|---|---|
| Hinge/Bumble lanzan lo mismo nativo | El copiloto de chat multi-app + español nativo no lo pueden copiar rápido; velocidad |
| Detección de screenshots imposible de parsear (UI cambia) | Visión LLM es robusta a cambios de UI vs OCR por template |
| Costo de API se dispara | Contratos JSON cortos, caché de lecturas de perfil, cupos por plan (§8.1), Radar a modelo barato |
| Apple rechaza por contenido dating | Categoría lifestyle/coaching; sin contenido sexual; precedente: YourMove/Rizz aprobadas |
| Acusación de "app para manipular" | Las líneas rojas §2.1 son públicas y de marketing; veredictos con evidencia |

**Riesgos nuevos que introduce la v2.0** (van con el eje de mercado y hay que mirarlos):

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| **El índice no discrimina** (todo sale 72) | Es el modo de falla que mata el producto entero: un índice que no separa no vale nada y el usuario lo detecta en dos usos | Bucket antes que número + ancla obligatoria + `superRefine` que rechaza el score fuera de rango. Eval suite que mida **distribución**, no solo que parsee |
| **El índice discrimina pero está mal calibrado** | Más sutil y más peligroso: se ve creíble y es falso | `probabilidad_respuesta` relativa y no absoluta, derivados en código para poder recalibrar sin tocar prompts, `margen` y `confianza` visibles en la UI |
| **Puntuar a un tercero que no consintió** | Es lo que separa a este producto de un revisor de fotos, y es su flanco reputacional | El output es privado y uno a uno, nunca publicado. Se puntúa **posición de mercado sobre lo que ella publicó**, con evidencia, no atributos de la persona. Nunca orientación, salud ni disponibilidad. El disclaimer va en el propio contrato |
| **Menores en las fotos subidas** | Único riesgo penal real del producto | Filtro `menor_aparente` antes de puntuar, 422, sin archivar. Test en contrato de que un rechazo no puede arrastrar scores |
| **Usuario en espiral fatalista** | No es solo un problema humano: es churn. El que cree que nada sirve deja de ejecutar y se da de baja | Regla 4 del coach (todo termina en algo que él controla) y `descomposicion` del Comparador (puntos cerrables siempre visibles) |
| **Screenshot del producto usado como prueba en una denuncia** | Un opener nuestro dentro de una denuncia por acoso liquida la marca en un día | Freno de acoso en el coach, techo `sexual_indirecto` en openers, tono gateado por gap, `licencia` obligatoria |

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

> **Nota (ago-2026):** esta sección es una foto del 19-jul y quedó parcialmente vieja (hoy
> son 139 tests y hay deploy automático). El checklist de salida vigente vive en
> `ESTADO.md` §5. No duplicar: se mantiene acá como registro de la auditoría de esa fecha.

---

## 14. Changelog v1.0 → v2.0 (1-ago-2026)

Qué se decidió, qué se construyó en esta vuelta y qué queda pendiente.

### 14.1 Lo que se construyó (código, no propuesta)

Todo con typecheck limpio y tests verdes: **139 tests** (105 en `apps/api`, 34 en
`packages/contracts`).

| Pieza | Archivo | Estado |
|---|---|---|
| Primitivas de mercado | `packages/contracts/src/market.ts` | Nuevo. `Bucket`, `RANGO_BUCKET`, `ComponenteIndice`, `IndiceAtractivo`, `Selectividad`, `VolumenMatches`, `ProbabilidadRespuesta`, `GapAtractivo`, `Autenticidad`, `TonoOpener`, `Opener`, `Inversion`, `AnalisisRechazado` |
| F5 v2.0 | `packages/contracts/src/profile-read.ts` | Reescrito. Bloque de mercado + bloque de curaduría + openers. `version: '2.0'` |
| Radar | `packages/contracts/src/radar.ts` | Nuevo. `IndiceRapido` + `RadarRead` |
| Comparador | `packages/contracts/src/compare.ts` | Nuevo. `PuntosCerrables`, `LadoComparador`, `CompareResult` |
| Fixture F5 | `packages/contracts/fixtures/profile-read.json` | Reescrito a v2.0, realista y completo |
| Tests | `packages/contracts/src/contracts.test.ts` | 34 tests, incluidos los de calibración |
| Coach v2 | `prompts/coach/system.md` | Reescrito |
| Tests de coach | `apps/api/src/coach/routes.test.ts` | Verifican el prompt v2 |

**Los tests que hacen trabajo real** (no son decorativos): que un score fuera del rango de su
bucket no parsee; que un componente sin `ancla` o sin `evidencia` no parsee; que los rangos
de bucket cubran 0-100 sin huecos ni solapes; que el Radar exija exactamente 3 openers y no
pueda declararse `precision: 'completa'`; que un `AnalisisRechazado` no pueda arrastrar
scores adentro; y que el system prompt del coach arrastre las verdades de mercado
licenciadas, la regla de accionabilidad, el piso de salud mental y el freno de acoso.

### 14.2 Decisiones de producto tomadas

1. **El producto es un instrumento de posición de mercado**, no un revisor de perfiles. Todo
   lo demás sale de ahí.
2. **F5 pasa a ser el eje**, no un upsell del Copiloto.
3. **Bucket antes que número** como regla de calibración obligatoria, con enforcement en el
   contrato y no solo en el prompt.
4. **Derivados en código**, LLM solo percibe. Extiende la regla que ya existía para F4.
5. **Probabilidad relativa, nunca absoluta**, hasta que F6 mida.
6. **El coach puede decir las verdades del mercado** y ya no puede cerrar en fatalismo.
   Cambió el motivo de la regla: dejó de ser de tono y pasó a ser de retención.
7. **Roadmap reordenado por valor entregado.** F1b primero, F5 después, Radar y Comparador
   tercero, Kit cuarto, F4 quinto.
8. **Cupos por plan desde el día uno** y Radar a modelo barato: la economía no cierra sin
   eso.
9. **Puertas adentro crudeza total, puertas afuera el enemigo es el diseño del juego.** No
   por moral: por ads y por segmento que paga (§9.3).

### 14.3 Lo que hay que hacer (en orden)

1. **F1b** (Fase 1b): el motor de F1 tiene que emitir `IndiceAtractivo` del usuario. Es la
   dependencia de todo el eje nuevo. Días, no semanas.
2. **F5 v2.0** completo: `engines/market.ts` + `engines/profileread.ts` + rutas + cupo + UI.
3. **Radar y Comparador**, que salen casi gratis arriba de lo anterior porque comparten
   `market.ts`. Con ellos, la card compartible del gap.
4. **Cerrar la promesa del Kit** (F3 + F2 barato) o recortar la página de venta.
5. **F4**, el moat, cuando haya usuarios con conversaciones para calibrarlo.
6. **Producción seria**: legales, tracking, analítica, credenciales, CORS, cupos.

### 14.4 Deuda que esta revisión deja marcada

- **La eval suite del índice todavía no existe.** Los tests verifican que el contrato haga
  cumplir la calibración; no verifican que el modelo calibre bien. Eso necesita casos
  dorados con distribución conocida y es lo primero que hay que armar al construir F1b.
- **`engines/market.ts` no está escrito.** Los pesos (facial .50 / presentacion .30 /
  produccion .20, renormalizando sobre no nulos) están documentados acá y en el contrato,
  pero el código es de la Fase 1b/2.
- **La mudanza de vocabulario sigue a medias.** Conviven "expediente forense" (§1.3 de esta
  spec y componentes vivos), "cabina de instrumentos" y ahora un tercer registro de mercado
  (índice, bucket, tier, gap), que es el que corresponde al producto real. Elegir uno, hacer
  un pase y cerrarlo. `GUIA-VISUAL.md` es la referencia canónica y también hay que revisarla.
- **§1.3 de esta spec (identidad visual) no se tocó** en esta revisión y describe la etapa
  forense. Vale como tokens de color; el resto hay que releerlo contra el producto v2.

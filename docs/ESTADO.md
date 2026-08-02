# DATEMAXXER - propuesta de valor y estado real

Actualizado: 1-ago-2026 (revisión de producto: eje de mercado). Este documento dice qué es
el producto, qué está construido de verdad y qué falta. Sin optimismo: si algo está a
medias, dice a medias.

Documentos hermanos: `percentil-spec.md` (spec funcional completa, actualizada a v2.0 en la
misma vuelta que este documento; su §14 es el changelog detallado), `GUIA-VISUAL.md`
(reglas de toda superficie visual), `AGENTS-LOG.md` (changelog entre agentes).

---

## 0. La revisión del 1-ago en una página

**Qué cambió de fondo:** el producto dejó de ser un revisor de perfiles y pasó a ser un
instrumento de posición de mercado. Le dice al usuario en qué escalón está, en qué escalón
está ella, y cuáles de esos puntos puede recuperar.

**Qué se construyó** (código con typecheck limpio y 139 tests verdes, no propuestas):

- `packages/contracts/src/market.ts` (nuevo): las primitivas que comparten F5, Radar y
  Comparador. Índice de atractivo desglosado, selectividad, volumen, probabilidad de
  respuesta, gap, autenticidad, openers con tono y riesgo, veredicto de inversión, y el
  rechazo duro por `menor_aparente`.
- `profile-read.ts` reescrito a **F5 v2.0**.
- `radar.ts` y `compare.ts` (nuevos): contratos del Radar de swipe y del Comparador.
- `prompts/coach/system.md` reescrito a **v2**.
- Fixture y tests: 34 en contratos, incluidos los de calibración; los del coach verifican
  el prompt v2.

**Las dos decisiones técnicas que sostienen todo esto:**

1. **Bucket antes que número.** Un LLM al que le pedís "puntuá 0-100" devuelve 72 para todo
   el mundo, y un índice que no discrimina no vale nada. El motor elige primero una etiqueta
   de bucket con definición escrita y recién ahí afina el score; el contrato rechaza el
   parse si el número no cae en el rango de su bucket. Más el `ancla` anti-regresión.
2. **Los derivados van en código.** `volumen_matches`, `probabilidad_respuesta` y `gap` los
   calcula `engines/market.ts`, no el LLM. Misma regla que `behavior.ts` en F4. Es lo que
   permite recalibrar contra resultados reales sin tocar prompts.

**Qué sigue, en orden:** ~~F1b~~ (**hecho el 1-ago**, ver §4) → F5 v2.0 completo → Radar y
Comparador + card compartible del gap → cerrar la promesa del Kit → F4 → producción seria.
Detalle en §7.

**Lo que F1b dejó listo para la Fase 2:** `engines/market.ts` con los derivados en código
ya está escrito y testeado, y F5 lo usa entero. La Fase 2 arranca con esa mitad hecha.

**Los tres flags que hay que mirar antes de empujar tráfico:** F1b bloquea el `gap` de las
tres funciones nuevas (§4), la economía no cierra sin cupos y sin Radar en modelo barato
(§8), y la mudanza de vocabulario sigue a medias (§8).

---

## 1. Qué es

Un copiloto de citas con IA para hombres en apps de dating en LATAM.

El usuario sube sus fotos y su bio. La app le dice en qué escalón del mercado está parado,
qué está transmitiendo sin querer, qué tan legible es en los 200 milisegundos que dura un
swipe, y cuáles de esos puntos puede recuperar. Después lo acompaña: le lee el perfil de
ella con el mismo instrumento, le muestra el gap entre los dos, le audita las
conversaciones, y le dice cuándo invertir y cuándo soltar.

No es un revisor de fotos: es un instrumento de posición de mercado.

El input es siempre screenshot o texto pegado. No hay integración con Tinder, Bumble ni
Hinge, y no la va a haber: sus APIs no oficiales son terreno de baneo.

### A quién le sirve

El tipo que ya usa las apps, no matchea lo que espera, y sospecha que el problema no es
él sino cómo se está presentando. No el que quiere una novia mágica: el que quiere
entender el juego. Ese paga.

### Con quién compite

Con nada directo en LATAM. En EEUU hay servicios de "photo review" hechos por humanos
(caros, lentos, en inglés) y apps de fotos con IA que retocan mintiendo. Los dos venden lo
mismo: que el problema es cosmético.

Datemaxxer vende otra cosa: **te decimos en qué escalón del mercado estás parado, en qué
escalón está ella, y cuál de esos puntos podés recuperar.** El retoque no mueve el número;
la cara presentada bien, el físico y la calidad de las fotos sí. Esa es toda la diferencia
y es la razón por la que alguien paga en vez de mirar un video de YouTube.

---

## 2. La propuesta de valor

Tres capas, en orden de cómo el usuario las encuentra.

### Capa 1 - el gancho gratis: la auditoría de arquetipo

Subís 4 a 9 fotos y tu bio. En menos de un minuto recibís:

- **Score de coherencia 0-100**: qué tan legible sos en un swipe.
- **Arquetipo detectado**: cuál de los ocho estás transmitiendo, con la evidencia foto por
  foto ("la 3 dice viajero, la 5 lo contradice con oficina").
- **Un insight crudo**, el que más duele y más sirve.

Es gratis, es una sola vez por cuenta, y existe para dos cosas: demostrar en un minuto que
el análisis es real, y generar una card compartible que traiga al siguiente.

**Por qué funciona:** nadie sabe cómo se ve su propio perfil. Todos creen que se leen como
quieren leerse. La brecha entre eso y el resultado es el momento en que el producto se
gana la credibilidad.

### Capa 2 - el core pago: el Kit de Perfil (USD 19, pago único)

La auditoría completa más las herramientas para arreglarla:

- Plan de fotos: cuál sacar, cuál reemplazar, en qué orden, y el brief de la foto que te
  falta ("exterior, luz de día, plano medio, haciendo X").
- Estudio de fotos: corrección técnica, color por arquetipo, expansión de encuadre. Nunca
  se toca la cara ni el cuerpo. Está prohibido en el código, no en la política.
- Bio por intención: tres variantes según qué buscás y cómo hablás.
- Re-auditoría a los 30 días para medir si sirvió.

### Capa 3 - la retención: el Copiloto (USD 12/mes)

Acá vive el negocio recurrente:

- **Lectura de perfil ajeno (F5)**: índice de atractivo desglosado, cuánto puede darse el
  lujo de filtrar, cuánto volumen le entra, qué chance real tiene él de respuesta, el gap
  contra su propia auditoría, y el veredicto de si vale el esfuerzo. Más los openers, con
  el tono calibrado por el gap.
- **Radar**: lo mismo comprimido a cinco segundos, para usar con el pulgar sobre el botón.
- **Auditoría de chat**: latencias, ratio de esfuerzo, quién reengancha después del
  silencio, y un veredicto - invertir más, mantener, proponer salida ahora, bajar la
  energía, o dejarlo morir. Con la evidencia adelante.
- **Coach**: donde entiende por qué le está yendo como le está yendo. No procesa
  sentimientos: lee el mercado, decide si insiste o suelta, y sale con una acción. Es lo
  que hace que vuelva los días que no tiene nada que auditar.

**Vida útil estimada de la suscripción: ~2 meses.** No se pelea contra eso. El Kit es la
rampa, el Copiloto es el acompañamiento durante el período en que el tipo está activo, y
la baja no es un fracaso: es que le funcionó. La métrica que importa no es el churn, es
cuántos vuelven en la siguiente racha.

### La regla que sostiene todo

Los motores leen sin eufemismos lo que ella eligió publicar: **nivel de atractivo,
selectividad, estilo de vida, estándar de plan y expectativa de inversión.** Todo con
`evidencia[]` y `confianza`. Un motor que se guarda el diagnóstico para no incomodar es un
motor que no sirve, y el usuario se da cuenta en el primer informe.

Lo único que no se infiere nunca: **orientación, salud, y disponibilidad sexual como
estado de la persona** ("está para algo", "es fácil"). El contrato es `.strict()` y hace
fallar el parse si el motor inventa un campo así.

El corte no es de pudor, es de anclaje: esos tres claims no se pueden atar a ninguna
evidencia visible, así que el modelo los alucina siempre, y un solo claim alucinado
convierte el informe entero en un horóscopo. Lo que sí se lee es **qué tono habilita su
curaduría**, que es una cosa distinta, se apoya en lo que ella publicó, y vive en
`Opener.licencia`.

**Se lee todo lo que ella eligió mostrar; no se adivina lo que no mostró.**

Y un piso que no se toca: si el sujeto aparenta ser menor, el motor no puntúa, no archiva y
devuelve `AnalisisRechazado` con `motivo: 'menor_aparente'`. La ruta responde 422. No es
una decisión de tono, es la única línea del producto que puede terminar en un problema
penal.

---

## 3. Qué está construido hoy

### 3.1 Infraestructura

| Pieza | Estado | Dónde |
|---|---|---|
| Monorepo pnpm | Funcionando | `apps/api`, `apps/web`, `packages/contracts` |
| API Fastify 5 + TypeScript | En producción | `datemaxxer-api.onrender.com` |
| Web Next 16 + React 19 | En producción | `datemaxxer.vercel.app` |
| Supabase (Postgres + Auth + Storage) | Funcionando | schema `percentil`, buckets `percentil-*` |
| Login Google + email OTP | Funcionando | Supabase Auth |
| CI GitHub Actions | Verde | typecheck + tests en cada push |
| Deploy automático | Funcionando | push a `main` dispara Render y Vercel |
| App móvil | **No existe** | `apps/mobile` vacía, es Fase 3 |

Detalles que costaron y conviene no volver a descubrir:

- Todo vive en el schema `percentil`, nunca en `public`: la instancia de Supabase se
  comparte con AgentSuite. Las migraciones nuevas se fechan **después** de la última
  remota aunque sea de otro proyecto.
- La API corre detrás del proxy de Render con `trustProxy: true`. Sin eso `request.ip` es
  la IP del proxy para todos y el rate limit se vuelve un cupo global compartido.
- El rate limit va por usuario cuando hay token, por IP cuando no (`rate-limit.ts`).
- El plan gratuito de Render duerme a los 15 minutos. Al arrancar, la API cosecha las
  auditorías que quedaron colgadas en "analizando" de un reinicio y les devuelve el cupo.

### 3.2 F1 - Motor de Arquetipos

**Es lo único del producto que está terminado y funcionando end to end.**

- Motor en `engines/audit.ts`: `claude-opus-4-8`, cadena de dos pasos (una llamada por
  foto, después una de síntesis), salida estructurada validada con Zod y reintento de
  reparación si el modelo devuelve algo que no cierra.
- `POST /audit` responde 202 y procesa en background; `GET /audit/:id` devuelve estado y
  progreso real (`fotos_analizadas` / `total`).
- Cupo atómico: la creación de la auditoría y el descuento del cupo pasan en una función
  de Postgres con `for update`. Está probado contra la base real que dos llamadas
  concurrentes con un cupo dejan exactamente una fila.
- Las auditorías fallidas no queman cupo.
- Techo de tiempo: si tarda demasiado se marca error y se devuelve el cupo. Nunca queda
  "analizando" para siempre.
- Las fotos originales se archivan en Storage en paralelo al análisis. Si el archivado
  falla, el análisis sigue.
- La web reduce las fotos a 1600px antes de subirlas, respetando la orientación EXIF.

Costo real por auditoría: entre USD 0,05 y 0,10 de API.

### 3.3 La experiencia web

El funnel completo está porteado de los prototipos y corre con datos reales:

**Ingreso** (sello lacrado sobre Google OAuth y OTP) → **Mesa** (drag and drop de fotos con
marco SVG que se redibuja al alto real de la grilla) → **Escáner** (la timeline de GSAP
está siempre pausada y el playhead lo mueve el progreso real del polling, no un temporizador
falso) → **Informe** (el hatching y la zona son dinámicos según el score, el sello dibuja
el glifo del arquetipo detectado) → **Límite** cuando se acabó el cupo.

Más: **sidebar persistente** con foto, identidad y cierre de sesión; **configuración** con
región, nombre y cuentas vinculadas; **historial** de auditorías; **rehacer análisis**.

La narrativa de "expediente forense" y "detective" quedó descartada. El vocabulario nuevo
es de cabina de instrumentos y copiloto. **Queda mudado a medias**: los componentes vivos
todavía tienen restos del vocabulario viejo.

### 3.4 Cuenta, planes y cobro

- `GET /me`, `PATCH /me`, `GET /me/audits`, `GET /me/audit`.
- Tres planes: `free`, `kit`, `copilot`.
- **Cobro manual** (decisión del 27-jul): el usuario pide el plan desde la app, queda
  registrado, llega un mail, se manda un link de pago de Mercado Pago y se activa el plan
  desde el panel. Motivo: todas las pasarelas y Merchant of Record exigen verificar un
  negocio que todavía no existe, y no se abre actividad antes de tener clientes.
- **Panel de admin** en `/app/admin`: pedidos pendientes con activar o descartar, lista de
  usuarios con buscador, cambio de plan de cualquiera. Admins por variable de entorno, no
  por columna en base. Las rutas de admin devuelven 404 a quien no es admin.
- **Backend de Paddle completo y sin usar**: verificación de firma HMAC con ventana
  anti-replay, idempotencia por `provider_event_id`, traducción de eventos a planes. Queda
  listo para el día que se formalice. El frontend nunca activa un plan: solo el webhook
  verificado.

### 3.5 Coach (prompt v2)

Construido el 1-ago, endurecido el 1-ago con el prompt v2.

Un chat continuo donde el usuario entiende por qué le está yendo como le está yendo. La v1
era un acompañante; la v2 es un entrenador. Cambió lo siguiente:

- **Vocabulario de terapia prohibido explícitamente**: nada de "sanar", "tu proceso",
  "validarte", ni preguntas de consultorio. No consuela: explica.
- **Sección nueva "lo que SÍ podés decir sin rodeos"**, con las verdades de mercado
  licenciadas una por una: desbalance de la plataforma, cola larga de likes del lado
  masculino, selectividad femenina alta y racional, tendencia a apuntar hacia arriba,
  dominancia del atractivo físico sobre la bio, y existencia de jerarquías visibles. Están
  escritas explícitamente porque **un modelo al que no le licenciás el claim, lo hedgea**.
  Sin esa lista, el coach vuelve solo al registro tibio en dos turnos.
- **Se cayó la regla "el enemigo nunca son las mujeres"** y la reemplazó una regla de
  rendimiento: *todo termina en algo que él controla*. El coach puede decir que el juego
  está torcido, cuánto y por qué; lo que no hace es dejarlo ahí. El motivo no es de tono:
  un usuario convencido de que nada de lo que haga importa deja de sacarse fotos, deja de
  escribir y se da de baja. La retención se pierde por el lado del fatalismo, no por el
  lado de la crudeza.
- **Regla nueva 7 (freno de acoso)**: no insistir después de un no, no buscarla fuera de la
  app, no rastrear otras redes. Es riesgo de marca, no cortesía.
- Se mantienen el piso de salud mental y "no prometés resultados".

Los tests de `apps/api/src/coach/routes.test.ts` verifican que el system prompt arrastre
las verdades de mercado licenciadas, la regla de accionabilidad, el piso de salud mental y
el freno de acoso, y que la regla vieja ya no esté.

- El coach conoce su score, su arquetipo, la lectura que le dimos y hace cuánto fue. Si
  nunca auditó, lo sabe y no inventa.
- La respuesta va **en streaming**: se ve escribir desde el primer segundo. Una respuesta
  de coach tarda varios segundos y una pantalla quieta pierde al usuario.
- Qué es esta función está definido en `prompts/coach/system.md`, no en el código. Ahí
  están las reglas duras: no mentir para que se sienta bien, una acción por respuesta, el
  enemigo nunca son las mujeres, y el corte explícito cuando aparece algo que excede una
  charla sobre citas.
- El mensaje del usuario se guarda **antes** de llamar al modelo, y si el stream se corta a
  la mitad se guarda lo que alcanzó a decir. Nunca queda un hueco en la conversación.
- Cupo por plan: 10 mensajes gratis, 40 con el Kit, sin tope con Copiloto. Es la palanca de
  upsell más natural que tiene el producto.

Es la única razón para abrir la app un día que no hay nada que auditar, que es exactamente
lo que sostiene una suscripción.

### 3.6 Calidad

139 tests en el monorepo (105 en `apps/api`, 34 en `packages/contracts`), typecheck limpio,
CI verde. Lo que cubren no es decorativo: la carrera de cupo contra la base real, que un
usuario común no pueda subirse el plan solo, que el pedido de upgrade sobreviva a que se
caiga el proveedor de mail, que el parser de cuerpo crudo del webhook no se escape de su
scope y rompa `PATCH /me`, y que un mensaje al coach no se pierda si el modelo se cae en el
medio.

De los nuevos, los que hacen trabajo real son los de calibración: que un score fuera del
rango de su bucket no parsee, que un componente sin `ancla` o sin `evidencia` no parsee,
que los rangos de bucket cubran 0-100 sin huecos, que el Radar exija exactamente 3 openers
y no pueda declararse `precision: 'completa'`, y que un `AnalisisRechazado` no pueda
arrastrar scores adentro.

---

## 4. Qué NO está construido

Esto es la parte honesta. De las seis funciones de la spec **está una**, más el coach
de confianza que no estaba en la spec original y se construyó el 1-ago.

| Función | Contrato Zod | Motor | Rutas | UI |
|---|---|---|---|---|
| **F1** Arquetipos (coherencia) | Sí | Sí | Sí | Sí |
| **F1b** Índice de atractivo propio | Sí | **Sí** | **Sí** | **No** |
| **F2** Estudio de fotos | No | No | No | No |
| **F3** Bio por intención | No | No | No | No |
| **F4** Copiloto de chat | **Sí** | No | No | No |
| **F5** Lectura de perfil ajeno v2.0 | **Sí** | No | No | No |
| **F6** Métricas del usuario | No | No | No | No |
| **Radar** | **Sí** | No | No | No |
| **Comparador de atractivo** | **Sí** | No | No | No |
| **Coach** | Sí | Sí (v2) | Sí | Sí |

Contratos escritos y validados con tests: F4 (`chat-turn-analysis.ts`), F5 v2.0
(`profile-read.ts` + `market.ts`), Radar (`radar.ts`), Comparador (`compare.ts`). El diseño
de la salida ya está decidido, que es la parte que más se discute.

**F1b quedó construido el 1-ago** (motor + rutas). El `gap` de F5, el `gap_delta` del Radar
y el lado `usuario` del Comparador ya tienen de dónde leer el índice del usuario:
`GET /me` lo devuelve. Falta la UI, que va junto con el rediseño del informe.

Qué se hizo, en concreto:

- `engines/market.ts`: los derivados en código. `calcularGlobal` renormaliza sobre los
  componentes no nulos en vez de rellenar con un promedio, `calcularMargen` ensancha la
  banda con lo que no se pudo ver, `bucketDe` cierra el círculo con los rangos del
  contrato. Pesos distintos para `usuario` y `objetivo`, y un test que verifica que cada
  juego suma 1. **Este archivo también es la mitad de la Fase 2**: F5 lo usa entero.
- El paso 2 de `engines/audit.ts` pide los tres componentes percibidos y nada más. `global`,
  `bucket_global` y `margen` los pone el código, y el contrato del paso es `.strict()` sin
  esos campos: un modelo que devuelva su propio `global` hace fallar el parse. Hay un test.
- Si el modelo no pudo juzgar ni un componente, el índice sale `null`. Mejor sin número que
  con uno inventado, porque este número alimenta tres funciones río abajo.
- `latestIndiceForUser` en el store, separado de `latestForUser`. Motivo concreto: esa
  última devuelve la auditoría más nueva sea cual sea su estado, así que mientras el
  usuario rehace el análisis su índice desaparecía y el gap volvía `null` justo mientras
  está usando la app. Hay cuatro tests que fijan esa regla.
- `AuditResult` acepta `'1.0'` y `'2.0'`: hay filas guardadas de antes de F1b y el historial
  tiene que poder leerlas.

**Consecuencia comercial:** hoy alguien puede pagar el Kit y recibir menos de lo que la
página promete. Eso hay que cerrarlo antes de empujar tráfico.

---

## 5. Bloqueantes reales para producción

Ordenados por cuánto duele salir sin ellos.

1. **La migración de solicitudes de upgrade no está aplicada.** El botón del Kit falla
   hasta que se corra. Es un SQL de treinta segundos en el editor de Supabase.
2. **El Kit no entrega lo que promete.** Falta F2 y F3. O se construyen, o se recorta lo
   que dice la página de venta. Cobrar por algo que no existe no es una opción.
3. **Páginas legales sin publicar.** Los borradores están en `docs/legal/` con cada punto
   que necesita abogado marcado. Manejamos fotos de personas: esto no es opcional.
4. **CORS abierto por defecto** si no se fija `CORS_ORIGINS`.
5. **Credenciales para rotar.** Hubo llaves de API en el entorno de desarrollo durante toda
   la construcción. Rotar antes de abrir al público.
6. **Sin tracking de errores ni analítica.** Hoy, si a un usuario le falla algo, nadie se
   entera. Sin métricas de funnel no se sabe dónde se cae la gente.
7. **La home de `apps/web` sigue en placeholder.** El landing real es HTML estático aparte.
8. **Sin cupos por plan para F5 y Radar.** Hoy no existen porque las funciones no existen,
   pero salir sin ellos es abrir la canilla: el margen de la suscripción no aguanta un
   usuario que use el Radar en cada swipe. Ver §8.
9. ~~F1 no emite índice de atractivo (F1b).~~ **Resuelto el 1-ago.** Queda pendiente la UI
   y, sobre todo, la **eval suite del índice**: hoy los tests verifican que el contrato
   haga cumplir la calibración, no que el modelo calibre bien. Nadie sabe todavía si la
   distribución real se abre o se aplasta en `medio`/`alto`, y eso solo se ve con casos
   dorados de fotos reales. Es el riesgo abierto más grande del eje nuevo.

---

## 6. Funcionalidades pendientes, con criterio

### 6.1 Las que ya están en la spec

**F4 - Auditoría de chat.** El moat. El usuario pega el chat o sube screenshots y recibe:
latencias y su derivada, ratio de esfuerzo, quién reengancha, profundidad, registro
detectado, tres sugerencias etiquetadas por estrategia, y el veredicto.

Detalle que la hace defendible: **los cálculos van en código, el modelo solo interpreta.**
Las latencias y los ratios los saca `engines/behavior.ts` con aritmética, no el LLM. Un
modelo que "estima" que la latencia se triplicó es un modelo que inventa.

El veredicto es falseable: a los 3-7 días la app pregunta qué pasó. Eso es un feedback loop
real y es la base de cualquier mejora futura.

**F5 - Lectura de perfil ajeno.** El feature más potente del producto y el único que no
puede copiar un servicio de photo review. Contrato v2.0 escrito y validado en
`packages/contracts/src/profile-read.ts` + `market.ts`.

v1.0 leía curaduría: qué eje declara, qué tan producida está, qué ganchos hay. Correcto y
la mitad de lo que hace falta. La pregunta que el usuario realmente se hace antes de
escribir es **"¿tengo chance acá o estoy perdiendo el tiempo?"**, y v1 no la contestaba.

v2.0 la contesta. Qué devuelve:

| Campo | Qué es |
|---|---|
| `indice` | Atractivo 0-100 desglosado en `facial`, `presentacion`, `produccion`, más `global`, `bucket_global`, `margen` y `limitantes` |
| `selectividad` | baja/media/alta/muy_alta + `filtros_declarados[]` (altura, intención, verificación) |
| `volumen_matches` | bajo/medio/alto/muy_alto + los `drivers` que lo empujan |
| `probabilidad_respuesta` | muy_baja/baja/media/alta + `vs_baseline` (multiplicador contra su promedio) + `palancas` |
| `gap` | `delta` entero y `tier`: el_arriba / paridad / ella_un_tier / ella_dos_tiers. `null` si él no tiene auditoría propia |
| `autenticidad` | genuino / dudoso / probable_no_genuino + `tipo_sospecha` (bot, vendedora_contenido, catfish, agencia, inactiva) |
| `inversion` | perseguir / volumen_bajo_esfuerzo / oportunista / no_vale + `mensajes_antes_de_soltar` |
| `openers` | 1 a 4, cada uno con `tono`, `licencia`, `riesgo` y `por_que_funciona` |

Y todo el bloque de curaduría de v1 (eje, nivel, densidad competitiva, coherencia texto vs
fotos, `expectativa_de_plan` con su traducción cruda, ganchos, registro).

**Las cuatro decisiones técnicas que hacen que esto funcione y no sea un juguete:**

**1. Bucket primero, número después.** Un LLM al que le pedís "puntuá 0-100" devuelve 72
para todo el mundo. Es el modo de falla más caro que tiene este feature: si el índice no
discrimina, no hay producto. El motor elige primero un bucket de seis con definición
escrita (`bajo` p0-20 ... `top` p95-100) y recién ahí afina el número dentro de ese rango.
El contrato tiene un `superRefine` que hace fallar el parse si el score no cae en el rango
de su bucket. Hay test.

**2. El ancla anti-regresión.** Cada componente obliga al motor a escribir qué vería un
bucket arriba y uno abajo. Es lo que abre la distribución: forzarlo a describir los
vecinos le impide quedarse en el medio por default. Sin `ancla` el parse falla.

**3. El desglose no es cosmético.** `facial` es lo que ella no controla; `presentacion` es
semi; `produccion` es todo controlable. Esa partición es lo que vuelve el número
accionable: le dice al usuario si está compitiendo contra genética o contra una sesión de
fotos. Es también lo que hace posible el Comparador, que es donde vive el argumento de
venta del Kit.

**4. Los derivados se calculan en código.** `volumen_matches`, `probabilidad_respuesta` y
`gap` los saca `engines/market.ts` con aritmética sobre los componentes percibidos. Misma
regla que `engines/behavior.ts` en F4 (CLAUDE.md §5). Un modelo que "estima 23% de
respuesta" está inventando; una función determinística sobre entradas graduadas es
consistente, auditable y se recalibra sola cuando F6 empiece a medir resultados reales.

**Por qué la probabilidad es relativa y no absoluta.** Un porcentaje absoluto es mentira
con cara de dato: no tenemos su tasa real de respuesta hasta que F6 la mida. `vs_baseline`
(0 a 5, donde 1.0 es su promedio) es honesto, es más útil para decidir, y no envejece mal.

**El tono de los openers lo gatea el gap, no el humor del modelo.** El techo es
`sexual_indirecto`: insinuación y tensión, nunca explicitud. No es pudor, es conversión.
Un mensaje explícito de un hombre por debajo del tier de ella es la forma más rápida que
existe de comerse un unmatch, y el motor tiene que saberlo. Cada opener declara
`licencia` (qué mostró ella que habilita ese tono) y `riesgo` (probabilidad de unmatch
inmediato). Sin licencia visible, el tono baja solo.

**`autenticidad` es el campo que nadie pidió y el que más tiempo le va a ahorrar.** En
LATAM los bots, las revendedoras de contenido, las agencias y las cuentas muertas son una
fracción enorme del pool, y le queman más horas al usuario que cualquier gap de atractivo.
Se juzgan artefactos del perfil (marcas de agua, handles, linktree, patrones de sesión),
nunca a la persona.

**Costo y latencia.** Cadena de dos pasos como F1: una llamada de visión por foto y una de
síntesis. Estimado USD 0,06 a 0,12 por lectura. A 12 dólares de suscripción, un usuario
intensivo se come el margen en una semana. **Hay que meter cupo por plan desde el día uno**
(ver §8).

**F3 - Bio por intención.** La más barata de construir de todas: es una llamada de texto
con la blocklist anti-slop. Tres variantes según intención y registro regional.

**F2 - Estudio de fotos.** La más cara y la más lenta. Corrección técnica y color son
directos con `sharp`; el outpainting necesita fal.ai y control de máscara. La región de
personas es intocable y hay un test que lo asserta.

**F6 - Métricas.** Match rate antes y después. Es lo que sostiene la garantía de
devolución y lo que hace que el usuario vuelva a la semana cuatro.

### 6.2 Funcionalidades nuevas

**Radar (contrato escrito: `packages/contracts/src/radar.ts`).** F5 comprimido para el
momento del swipe. Devuelve `IndiceRapido` (bucket + score + una línea), `gap_delta`,
`probabilidad_respuesta`, exactamente 3 openers, `veredicto` de una palabra y
`alerta_autenticidad`.

Presupuesto duro: **una sola llamada de visión, sin cadena, menos de 5 segundos**. Todo lo
que agregue tokens de salida agrega latencia, y a los 8 segundos el tipo ya swipeó y el
producto no sirvió para nada. Por eso el índice del radar no lleva desglose ni anclas: sale
más barato y sale más impreciso, y el contrato lo declara con `precision: 'rapida'` en vez
de fingir la calidad de F5. La UI dice "estimación rápida" y ofrece el análisis completo.
Esa fricción declarada es la conversión natural del radar al Kit. El campo `ms_motor` se
loguea siempre para vigilar el presupuesto.

**Comparador de atractivo (contrato escrito: `packages/contracts/src/compare.ts`).** Su
mejor foto contra la de ella, lado a lado, con el gap y su explicación.

Es la función más compartible del producto y la que más rápido puede volverse un juguete
deprimente. Lo que la salva es `descomposicion`: el gap se parte en puntos **cerrables**
(producción, presentación, arreglo, encuadre) y **no cerrables** (rasgos), y cada acción
del plan viene con su ganancia en puntos y su plazo real (`hoy`, `semana`, `mes`,
`trimestre`, `año`), más un `techo_estimado` si ejecuta todo.

"Te separan 23 puntos" deprime y no vende nada. "De esos 23, 14 son tuyos y los cerrás en
seis semanas: fotógrafo, corte, y bajar seis kilos; los otros 9 son cara y no se negocian"
es un diagnóstico honesto **y** es literalmente el pitch del Kit. El contrato exige `plan`
con al menos una acción: un gap sin salida no se entrega.

Los pesos por componente difieren según el sujeto (en perfiles masculinos el peso se corre
de facial hacia presentación y señales de estatus). Viven en `engines/market.ts`.

**Triage de bandeja.** El usuario sube 8 o 10 screenshots de sus matches y recibe el
ranking de a cuáles contestar primero, cuáles son volumen y cuáles no vale abrir. Es
Radar en lote y es barato sobre lo mismo. Resuelve el problema real del tipo que ya tiene
matches y los está trabajando todos igual, que es la forma más común de desperdiciar los
pocos que servían.

**Simulador de conversación.** Practica una apertura contra un perfil que ya analizó, y el
modelo responde como respondería ella según su registro y su selectividad detectada. Al
final, qué funcionó y qué no. Convierte el consejo en repetición, que es lo único que
cambia conductas.

**Post-mortem de cita.** Después de una salida, cuatro preguntas y una lectura de qué
funcionó. Alimenta F6 y es lo que va a permitir recalibrar `probabilidad_respuesta` contra
resultados reales en vez de contra la intuición del modelo.

**El día siguiente.** Aviso diario corto y accionable: "este chat lleva cuatro días sin
movimiento, o proponés o lo soltás". Convierte una herramienta en un hábito.

**Card compartible.** Sigue sin construirse y ahora vale más: la card que se comparte no es
la del arquetipo, es **la del gap del Comparador**. Un número contra otro número es
contenido; un arquetipo es un test de Facebook. Sin card, cada usuario entra por su cuenta
y no trae a nadie.

---

## 7. Orden de construcción recomendado

Criterio anterior: primero lo que desbloquea cobrar. Sonaba prudente y estaba mal ordenado.
F3 (bio) es la función más barata de construir y también la que menos le importa a nadie: a
nadie lo rechazan por la bio. El orden nuevo es por **valor entregado por semana de
trabajo**, y eso pone el eje de mercado adelante de todo.

**Bloque 0 - la dependencia (días, no semanas).** F1b: extender el motor de F1 para que
además del score de coherencia emita `IndiceAtractivo` del usuario. Sin esto no hay gap, y
sin gap el Radar y el Comparador son la mitad de lo que prometen. Es el trabajo con mejor
relación valor/esfuerzo de toda la lista y hay que hacerlo primero.

**Bloque 1 - el eje del producto.** F5 v2.0 completo (motor + rutas + UI de informe). Es
lo que nadie más tiene en la región, es lo que justifica una suscripción y es lo que
convierte al producto de "revisor de fotos" en "instrumento de mercado". Los contratos ya
están.

**Bloque 2 - frecuencia y viralidad.** Radar y Comparador. Los dos salen casi gratis
arriba de F5 y F1b porque comparten `market.ts`. El Radar es lo que hace que abra la app
todos los días; el Comparador es la card compartible y el pitch del Kit en un solo
artefacto. Acá se construye la card, no en un bloque de "crecimiento" al final.

**Bloque 3 - cerrar la promesa del Kit.** F3 (bio) y la parte barata de F2 (corrección
técnica y color con `sharp`, sin outpainting). Va acá y no antes porque su valor es cerrar
un hueco comercial, no entregar algo que el usuario esté esperando. Alternativa legítima
mientras tanto: **recortar lo que promete la página de venta** y mover el Kit al eje de
mercado, que es lo que la gente en realidad quiere comprar.

**Bloque 4 - el moat.** F4 (auditoría de chat). Es la función más defendible del producto
y también la más cara de hacer bien, y necesita usuarios con conversaciones reales para
calibrarse. Antes de F5 estaba mal priorizada: F4 sirve cuando ya conseguiste el match, y
la mayoría de los usuarios se cae antes.

**Bloque 5 - producción seria.** Legales, tracking de errores, analítica de funnel, rotar
credenciales, cerrar CORS, cupos por plan. Nada de esto se puede empujar más allá del
primer día de tráfico pago.

**Bloque 6 - lo que sigue.** Triage de bandeja, simulador, post-mortem, el día siguiente.
F2 con outpainting y F6 al final: el primero es caro y el segundo necesita historia de
usuarios para significar algo.

---

## 8. Lo que hay que endurecer, arreglar o tirar

Cosas que el documento anterior dejaba pasar y que ahora son decisiones pendientes.

**La economía no cierra como está.** Suscripción USD 12/mes, vida útil estimada 2 meses:
LTV de suscripción USD 24. Contra eso, una lectura F5 cuesta 0,06 a 0,12 dólares y el
Radar está pensado para usarse **muchas veces por sesión**. Un usuario intensivo funde el
margen en una semana. Dos consecuencias, ninguna opcional:

1. **Cupos por plan desde el día uno**, en el mismo patrón atómico de Postgres que ya usa
   F1 (creación + descuento con `for update`). No se agrega después.
2. **Revisar el precio.** El Copiloto a 12 dólares está subvaluado para ser la única
   herramienta de su tipo en la región. El Kit a 19 pagos únicos está bien como rampa. Si
   hay que elegir uno solo para subir, es la suscripción.

**El Radar tiene que ir a un modelo más barato.** Con Opus por swipe no cierra ninguna
cuenta. El Radar es una sola llamada de visión con salida chica: es exactamente el caso de
uso de un modelo rápido. F5 y el Comparador se quedan con el modelo grande porque ahí la
calibración importa y el usuario espera.

**Terminar la mudanza de vocabulario o revertirla.** "Expediente forense" convive con
"cabina de instrumentos" en los componentes vivos. Un producto a medio renombrar se lee
como un producto abandonado. Ahora además hay un tercer registro (índice, bucket, tier,
gap) que es el que corresponde al producto real. Elegir uno, hacer un pase y cerrarlo.

**`docs/percentil-spec.md` quedó desactualizada.** La spec sigue describiendo F5 v1.0 y el
coach v1. Mientras no se actualice, este documento y los contratos mandan.

**La home de `apps/web` sigue en placeholder** y el landing real es HTML estático aparte.
Con el eje nuevo el landing tiene que cambiar igual: lo que se vende no es "auditamos tu
perfil", es "te decimos en qué escalón estás y cuál de esos puntos recuperás".

**Lo que NO se toca, y no es por tono:**

- El filtro de `menor_aparente`. Manejamos fotos de personas reales. Es lo único de este
  producto que puede terminar en un problema penal.
- El corte de salud mental del coach (regla 5). Un usuario en crisis no es un problema de
  estilo.
- El freno de acoso del coach (regla 7). No sugerir insistir después de un no ni buscarla
  fuera de la app es la diferencia entre un usuario con mala racha y un usuario denunciado,
  y una denuncia con capturas del producto adentro liquida la marca en un día.
- `evidencia[]` y `confianza` en todo claim. Es lo que separa un instrumento de un
  horóscopo, y es lo que va a permitir recalibrar cuando F6 mida resultados de verdad.

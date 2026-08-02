# DATEMAXXER - propuesta de valor y estado real

Actualizado: 1-ago-2026. Este documento dice qué es el producto, qué está construido de
verdad y qué falta. Sin optimismo: si algo está a medias, dice a medias.

Documentos hermanos: `percentil-spec.md` (spec funcional completa), `GUIA-VISUAL.md`
(reglas de toda superficie visual), `AGENTS-LOG.md` (changelog entre agentes).

---

## 1. Qué es

Un copiloto de citas con IA para hombres en apps de dating en LATAM.

El usuario sube sus fotos y su bio. La app le dice qué arquetipo está transmitiendo sin
querer, qué tan legible es su perfil en los 200 milisegundos que dura un swipe, y qué
tiene que cambiar. Después lo acompaña: le lee el perfil de ella, le audita las
conversaciones, y le dice cuándo invertir y cuándo soltar.

El input es siempre screenshot o texto pegado. No hay integración con Tinder, Bumble ni
Hinge, y no la va a haber: sus APIs no oficiales son terreno de baneo.

### A quién le sirve

El tipo que ya usa las apps, no matchea lo que espera, y sospecha que el problema no es
él sino cómo se está presentando. No el que quiere una novia mágica: el que quiere
entender el juego. Ese paga.

### Con quién compite

Con nada directo en LATAM. En EEUU hay servicios de "photo review" hechos por humanos
(caros, lentos, en inglés) y apps de fotos con IA que retocan mintiendo. Datemaxxer se
mete en el medio: análisis serio, automático, en el registro del usuario, y con una regla
que ninguno de los dos respeta - **mejoramos la foto, no te mejoramos a vos**.

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

- **Lectura de perfil ajeno**: qué está optimizando ella, qué tan competitivo es su perfil,
  y ganchos reales de conversación (lugares, estudios, laburo) con la forma de usarlos sin
  sonar a acosador.
- **Auditoría de chat**: latencias, ratio de esfuerzo, quién reengancha después del
  silencio, y un veredicto - invertir más, mantener, proponer salida ahora, bajar la
  energía, o dejarlo morir. Con la evidencia adelante.
- **Coach de confianza**: el lugar donde procesa el rechazo, la ansiedad previa a la cita y
  la duda de "¿le escribo?". Es lo que hace que vuelva los días que no tiene nada que
  auditar.

**Vida útil estimada de la suscripción: ~2 meses.** No se pelea contra eso. El Kit es la
rampa, el Copiloto es el acompañamiento durante el período en que el tipo está activo, y
la baja no es un fracaso: es que le funcionó. La métrica que importa no es el churn, es
cuántos vuelven en la siguiente racha.

### La regla que sostiene todo

Los motores leen sin eufemismos lo que ella eligió mostrar: estilo de vida, estándar de
plan, expectativa de inversión. Siempre con evidencia visible.

Nunca infieren disponibilidad sexual, orientación ni salud. Esos campos vuelven en `null`.

**Se lee todo lo que ella eligió mostrar; no se adivina lo que no mostró.** No es una
posición moral, es lo que hace que el output sea defendible y no un horóscopo.

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

### 3.5 Coach de confianza

Construido el 1-ago. Un chat continuo donde el usuario procesa lo que no es técnico.

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

104 tests en el monorepo, typecheck limpio, CI verde. Lo que cubren no es decorativo: la
carrera de cupo contra la base real, que un usuario común no pueda subirse el plan solo,
que el pedido de upgrade sobreviva a que se caiga el proveedor de mail, que el parser de
cuerpo crudo del webhook no se escape de su scope y rompa `PATCH /me`, y que un mensaje al
coach no se pierda si el modelo se cae en el medio.

---

## 4. Qué NO está construido

Esto es la parte honesta. De las seis funciones de la spec **está una**, más el coach
de confianza que no estaba en la spec original y se construyó el 1-ago.

| Función | Contrato Zod | Motor | Rutas | UI |
|---|---|---|---|---|
| **F1** Arquetipos | Sí | Sí | Sí | Sí |
| **F2** Estudio de fotos | No | No | No | No |
| **F3** Bio por intención | No | No | No | No |
| **F4** Copiloto de chat | **Sí** | No | No | No |
| **F5** Lectura de perfil ajeno | **Sí** | No | No | No |
| **F6** Métricas del usuario | No | No | No | No |
| **Coach de confianza** | Sí | Sí | Sí | Sí |

Los contratos de F4 y F5 ya están escritos y validados
(`packages/contracts/src/chat-turn-analysis.ts` y `profile-read.ts`). Eso adelanta trabajo
real: el diseño de la salida ya está decidido y discutido.

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

**F5 - Lectura de perfil ajeno.** Lo que más se va a compartir. Qué está optimizando ella,
qué tan competitivo es el perfil, ganchos reales con la forma de usarlos, y el campo
`expectativa_de_plan` con su traducción cruda ("su perfil vende un estándar; 'unas birras'
compite mal acá").

**F3 - Bio por intención.** La más barata de construir de todas: es una llamada de texto
con la blocklist anti-slop. Tres variantes según intención y registro regional.

**F2 - Estudio de fotos.** La más cara y la más lenta. Corrección técnica y color son
directos con `sharp`; el outpainting necesita fal.ai y control de máscara. La región de
personas es intocable y hay un test que lo asserta.

**F6 - Métricas.** Match rate antes y después. Es lo que sostiene la garantía de
devolución y lo que hace que el usuario vuelva a la semana cuatro.

### 6.2 Funcionalidades nuevas propuestas

**Simulador de conversación.** El usuario practica una apertura contra un perfil que ya
analizó, y el modelo responde como respondería ella según su registro detectado. Al final,
qué funcionó y qué no. Convierte el consejo en repetición, que es lo único que cambia
conductas.

**Radar de perfil en vivo.** Pegás el perfil de ella y en cinco segundos tenés tres
aperturas listas con su gancho. Es F5 comprimido para usar mientras swipeás, en el momento
exacto en que sirve.

**Post-mortem de cita.** Después de una salida, cuatro preguntas y una lectura de qué
funcionó. Alimenta las métricas y da la razón para volver.

**El día siguiente.** Un aviso diario corto y accionable: "hoy revisá esto", "este chat
lleva cuatro días sin movimiento, o proponés o lo soltás". Es lo que convierte una
herramienta en un hábito.

**Comparador de fotos.** Dos fotos, cuál gana y por qué, con el criterio explícito. Barato
de construir sobre F1 y de los que más se comparte.

**Card compartible.** Está en la spec del funnel y no está construida. Es el motor viral
completo: sin ella, cada usuario entra por su cuenta y no trae a nadie.

---

## 7. Orden de construcción recomendado

Criterio: primero lo que desbloquea cobrar, después lo que retiene, después lo que trae
gente nueva.

**Bloque 1 - cerrar la promesa del Kit.** F3 (bio) y la parte no cara de F2 (corrección
técnica y color, sin outpainting). Con esto el Kit entrega lo que dice y se puede cobrar
sin asterisco.

**Bloque 2 - el Copiloto.** El coach ya está. Sigue F4 (auditoría de chat) y después F5
(lectura de perfil ajeno).

**Bloque 3 - producción seria.** Legales, tracking de errores, analítica de funnel, rotar
credenciales, cerrar CORS.

**Bloque 4 - crecimiento.** Card compartible, radar en vivo, comparador de fotos.

F2 completo con outpainting y F6 quedan para después: el primero es caro y el segundo
necesita usuarios con historia para tener sentido.

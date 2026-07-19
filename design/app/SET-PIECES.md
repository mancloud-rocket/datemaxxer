# design/app · Registro de set pieces y auditoría de diferenciación
### (obligatorio por GUIA-VISUAL §6.1.5 · una entrada por pantalla)

## 1. EL ESCÁNER (`escaner.html`)

**Set piece nombrable: "La mesa de luz".** Las fotos del usuario son fotogramas de un
negativo (con perforaciones de película, esquineros de expediente, rayas de desgaste y
etiqueta FOTO 0N) que AVANZA a través de un cabezal de escaneo fijo, como película por un
proyector. El cabezal es un instrumento de 5 capas: cuerpo facetado con gradiente,
tornillos con ranura, respiraderos, lente con iris de 6 láminas que respira, pupila cyan
que late, LED de actividad y un cable con comba que se mece. Al pasar cada fotograma:
haz cyan, retícula de análisis, crosshair con pop, callouts que se revelan, y el sello
LEÍDA se estampa con su tilde dibujándose. Al terminar: salida coreografiada (el negativo
despeja hacia el bastidor izquierdo, el cabezal hacia el derecho) y entra desde la
profundidad el anillo de síntesis (36 segmentos, 3 calientes persiguiéndose) con el
corazón wireframe suturado latiendo al centro y las pruebas "en custodia" apiladas.

**Prueba del template:** ningún template tiene un proyector de negativos con cabezal
mecánico; la espera se convierte en la demo del producto (ver a la IA "leer" tus fotos).
**Momento héroe (timeline causal):** haz → retícula → crosshair → callouts → sello LEÍDA
(5 elementos, offsets escalonados, por cada foto).
**Estados forzables:** `?estado=analizando|sintetizando|error` · `?fotos=4..9` · `?qa=0..1`.

## 2. EL INFORME (`informe.html`)

**Set piece nombrable: "El estampado del veredicto".** Secuencia causal encadenada:
(1) la aguja del medidor (zonas óxido/ámbar/cyan con ticks, números, contrapeso y tornillo
en el pivote) barre con física elástica y SE CLAVA en 41 mientras el count-up corre y el
área de riesgo se raya con hatching; (2) el clavarse dispara el sello de zona y el sello
circular del arquetipo (doble anillo punteado + glifo VIAJERO dibujándose: montañas,
sol, sendero punteado, avión de papel) con su barra de confianza; (3) la lectura de
200 ms se subraya en óxido a mano; (4) el contenido pago entra YA COSIDO: puntadas de
sutura con ojales que se tensan una a una sobre cada ficha (que muestra su instrumento
real desenfocado detrás: teaser honesto), sello SELLADO y el desbloqueo con ficha
facetada y línea cyan.

**Prueba del template:** un dashboard mostraría un número; acá el veredicto se ESTAMPA
y lo pago está literalmente cosido con el gesto firma de la marca (sutura kintsugi).
**Momento héroe:** aguja → count-up → hatching → sello zona → sello arquetipo → glifo
dibujado → confianza (7 beats encadenados).
**Estados forzables:** `?estado=done|error|limite` · `?qa=1`.

## 3. LA MESA DE EVIDENCIA (`mesa.html`)

**Set piece nombrable: "El depósito de pruebas".** Depositás fotos en la mesa forense y
cada una CAE (drop desde arriba con inclinación determinística por índice, `back.out`) y
se ESTAMPA como prueba numerada (`FOTO 0N` con `stampIn`). El contenedor es la carpeta del
expediente: marco SVG con borde punteado + esquineros que se redibuja al alto real del
contenido (`requestAnimationFrame(drawMarco)` al final de cada `paint`). Cada prueba es una
ficha de archivo (esquineros en las 4 puntas, etiqueta FOTO, scrim para legibilidad,
etiqueta de escena forense "Playa · viaje / Oficina / Gimnasio…" que vende la tesis de
"señales que compiten"). La primera lleva sello **PORTADA** en ámbar (la carta de
presentación pesa más); acción propia **"hacer portada"** (estrella) que reordena a la
primera posición con pop, en vez de un drag genérico. Barra de conteo con pips (óxido→cyan
al llegar al mínimo) y CTA que se habilita en 4. Contexto: bio (textarea con contador),
selector de arquetipo con los 8 glifos propios (`glifos.js`), selector de región.

**Prueba del template:** un uploader genérico muestra thumbnails en grilla; acá el acto de
cargar es depositar evidencia numerada en una carpeta que se arma frente a vos, con la
jerarquía real del producto (la portada manda).
**Momento héroe:** foto cae → se asienta con su inclinación → FOTO 0N se estampa (por cada
depósito); pips viran óxido→cyan al desbloquear el mínimo.
**Estados forzables:** `?estado=vacia|lista|error` · `?err=cantidad|peso|formato` · `?qa=0..1`.
**Manejo real:** input file (jpeg/png, ≤12MB, 4–9), drag&drop, descartar, hacer portada,
validación con avisos en voz de marca. CORE portea la lógica; el reorder por drag en touch
queda para el port (acá el gesto clave es "hacer portada").

## 4. EL INGRESO (`ingreso.html`)

**Set piece nombrable: "La apertura del expediente".** No es un formulario: es una carpeta
lacrada que se abre. El sello central (doble anillo óxido + candado forense grabado) VIRA
de óxido a cyan al validar: los anillos cambian de color, el sello gira 190° (`svgOrigin`),
la horquilla del candado salta (`back.out`), el cuerpo se desvanece y entra un check cyan
DIBUJÁNDOSE (dashoffset). Dos pasos: método (Google 1 tap + email) → OTP de 6 casilleros
(auto-avance, backspace inteligente, pegado, shake en error). El HUD narra el arco:
EXPEDIENTE CERRADO → CÓDIGO ENVIADO → IDENTIDAD VERIFICADA.

**Prueba del template:** un login es una caja de texto y un botón; acá acceder es abrir un
lacre — el mismo gesto óxido→cyan (crack→sutura) que firma toda la marca, aplicado al acto
de autenticarte.
**Momento héroe:** los 6 dígitos completan → el sello gira y vira a cyan → candado se abre →
check se dibuja (5 beats) → telón hacia la mesa.
**Estados forzables:** `?estado=idle|codigo|invalido|abriendo` · `?qa=0..1`.
**Nota de contrato:** el flujo real es Google OAuth (Supabase, pendiente activación) + OTP
por email. Acá el código demo válido es `204172`. CORE cablea el auth real.

## Transversal: umbral entre escenas + aviso de conexión (`shared.css` / `shared.js`)

**Umbral de entrada (§4.2).** Hasta ahora `.telon` solo se usaba de salida (`telonHacia`,
sube tapando desde abajo antes de navegar). Faltaba el otro lado del umbral: al ATERRIZAR
en una pantalla nueva había un corte duro de navegador. Ahora las 4 pantallas nacen con
`<div class="telon cubierto">` (CSS puro: `scaleY(1)` desde el primer pintado, sin flash de
contenido crudo) y llaman `telonEntrada()` como primera línea de su script: la misma tela
recede (`scaleY 1→0`, mismo `transform-origin:bottom`) revelando la escena. Es un solo
gesto continuo repartido en dos páginas: la tela sube a tapar en la que te vas, la misma
tela baja a destapar en la que llegás.
**Estados forzables:** `?qa=1` fuerza el estado final instantáneo (`gsap.set`), igual que
el resto de los hooks de QA del proyecto - usarlo SIEMPRE en capturas, ver gotcha abajo.

**Aviso de conexión (`netError(msg, {onRetry})` / `hideNetError()`).** Franja de alarma
transversal, disparable desde cualquier pantalla para fallos de red (distinta del error de
análisis propio del escáner o de los avisos de validación de la mesa, que son estados de
escena completos). Diseñada como instrumento, no como snackbar genérico prohibido por
§11: franja de ancho completo en `--stamp` (óxido de marca, nunca coral/rosa), punto que
pulsa en vez de spinner, sin ícono stock. Se crea sola la primera vez que se llama (no
requiere markup en el HTML de la pantalla). Demo en contexto: `mesa.html` la dispara en el
submit del CTA cuando hay `?net=1` (con reintento real que reintenta el `telonHacia`).
**Hook global de QA: `?net=1` en CUALQUIER pantalla** la muestra de entrada con el mensaje
genérico, sin tocar el `?estado=` propio de esa pantalla. Sumale `&qa=1` para captura
instantánea (ver gotcha).

## Glifos de los 8 arquetipos (`glifos.js`)
Builder reutilizable (IIFE sobre `window`, sin dependencias): `ARQUETIPOS` (orden canónico),
`buildGlifo(slug,{size,stroke,cls})` → `<svg currentColor>`, `GLIFOS[slug](g)`. Line-art
artesanal 48×48 (§5.1): capa estructura + capa carácter (`.car`, detalle propio: el avión
de papel del viajero, la chispa de idea del intelectual, la pincelada del creativo, el humo
del hogar). Cada path es dibujable (`setDraw`). Los usa la mesa (selector) y quedan listos
para el informe (sello de arquetipo) y para CORE.

## Gotchas de QA aprendidos en este pase
- Los `seek()/progress()` de GSAP SÍ disparan calls (suppressEvents no es default en v3):
  los textos con decode necesitan setter instantáneo en modo QA (`INSTANT`).
- Nunca editar archivos UTF-8 con `Get-Content | Set-Content` (rompe encoding a cp1252
  mojibake); reparación probada: releer UTF8 → encode cp1252 → decode UTF8. Usar Edit tool.
- Estados con tweens en vivo (error) necesitan variante `?qa` con `gsap.set` finales.
- `[hidden]` NO oculta un elemento que tiene `display` explícito en el CSS de autor (el
  `[hidden]{display:none}` del UA pierde por orden de cascada). Regla global
  `[hidden]{display:none!important}` en la hoja de la pantalla. Mordió a `.empty` (display:flex)
  que se superponía a la grilla en `?estado=lista`.
- Marco SVG que envuelve contenido de alto variable: recalcular viewBox tras cada repintado
  con `requestAnimationFrame(drawMarco)` (leer clientHeight ya con layout resuelto).
- Screenshots headless en Windows: el sandbox del Bash tool bloquea la escritura del PNG
  (Edge sale 0 pero el archivo no aparece). Correr Edge desde el PowerShell tool. Y Edge
  clampea el ancho mínimo (~500px) e ignora el viewport: el desborde horizontal en capturas
  <500px es artefacto de captura, no bug de layout; validar mobile por auditoría de unidades
  relativas (`auto-fill`, `%`, `vw`, `flex-wrap`, media query ≤440px).
- Copy de la app: SIEMPRE tú neutro, cero voseo (regla del log). El registro regional
  (voseo/vos/che) es SOLO del informe de auditoría, no del shell de la app.
- `--virtual-time-budget` de Edge headless NO es confiable para animaciones dirigidas por
  GSAP (rAF corre en reloj real, el budget gobierna otra cosa): un mismo valor de budget
  puede capturar una pantalla ya resuelta y otra a mitad de tween, sin patrón predecible.
  NUNCA diagnostiques con budgets arbitrarios. Usar SIEMPRE `?qa=1` para capturas
  deterministas (fuerza `gsap.set` final) - es el mismo hook que ya exige el resto del
  proyecto, aplica también a `telonEntrada()` y `netError()`.
- Corolario del gotcha anterior: si agregás un componente con tween propio (como
  `netError()`), que respete `qsParam('qa')` desde el día uno, no solo `REDUCED` - si no,
  las capturas de QA lo van a mostrar a mitad de animación y va a parecer un bug de layout
  cuando es solo un problema de timing de captura (nos pasó con la primera versión de
  `netError()`, quedó corregido).

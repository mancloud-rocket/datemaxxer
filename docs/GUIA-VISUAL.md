# GUÍA VISUAL Y DE MOTION - DATEMAXXER

**Estatus: OBLIGATORIA y a rajatabla** para toda superficie visual del producto: landing,
app web (`/auditoria` y todo apps/web), app móvil, og-images, card compartible, emails.
Aplica a FRONT y a CORE por igual. La definió Fernando auditando el trabajo de la landing
(cinema.html) y elevándolo a estándar. Cambiarla requiere propuesta en AGENTS-LOG + ok de
Fernando. Ante la duda, la referencia canónica de cada patrón es `landing/cinema.html`.

La vara: **efecto wow y diferenciación visual como ventaja competitiva.** Si una pantalla
podría ser de cualquier SaaS, está mal aunque funcione. Cada superficie tiene que sentirse
parte de la misma película.

---

## 1. El principio rector: todo es una película forense

La marca no "tiene animaciones": la marca ES una narrativa que el usuario recorre.
El universo es un expediente forense que documenta un corazón que se rompe (óxido)
y se repara (sutura cyan). Toda pieza nueva se pregunta primero: **¿qué parte de esa
historia estoy contando?**

Consecuencias prácticas:
- Las secciones son **actos** (numerales romanos fantasma: stroke sin fill, `-webkit-text-stroke`).
- El estado del sistema se muestra como instrumentación forense (HUD, contadores de frame,
  sellos de expediente, barras de progreso semánticas óxido→cyan).
- Los datos nunca se "muestran": se **presentan como evidencia** (numerados, con fuente
  citada, con regla que se dibuja, con count-up).
- La transición problema→solución SIEMPRE es grieta óxido → sutura cyan. Es el gesto
  firma de la marca (spine de la landing, station 02, corazón final, wordmark XX).

## 2. Color: el color ES el argumento (no decoración)

Tokens (spec §1.3, ya en `apps/web/app/globals.css`):

| Token | Hex | Rol semántico ESTRICTO |
|---|---|---|
| `--void` | #101318 | Fondo base. Siempre oscuro. |
| `--surface` | #171B22 / #141922 | Paneles e instrumentos |
| `--line` | #262C36 | Bordes, ejes, rieles apagados |
| `--steel` / `--steel-dim` | #5B6672 / #333C47 | Estado actual, neutro, apagado |
| `--oxide` | #C94B32 | EL PROBLEMA: red flags, datos que duelen, grietas |
| `--stamp` | #8F2B22 | Sellos y bordes de expediente |
| `--sodium` | #E8B04B | Severidad media (uso escaso) |
| `--signal` | #4FD9C2 | LA SOLUCIÓN: solo CTAs, veredictos positivos, suturas, mejoras |
| `--ink` / `--ink-mute` | #E6E9ED / #8C96A3 | Texto |

Reglas duras:
1. **El cyan se gana narrativamente**: aparece cuando aparece la solución, nunca antes.
   En una pantalla de app: los diagnósticos del problema van en óxido/steel; la mejora,
   el CTA y el veredicto positivo van en cyan. Jamás cyan decorativo.
2. **Prohibido territorio Tinder**: coral, rosa, magenta, púrpura, gradientes calientes,
   llamas. El único rojo permitido es el óxido mate (corrosión, no pasión).
3. Estado sin JS / estado inicial también cumple la regla (bloqueante histórico de las seams).
4. `::selection` en óxido. Glows con el color semántico correspondiente
   (`box-shadow: 0 0 12-32px rgba(color, .28-.6)`), nunca glow blanco genérico.

## 3. Tipografía

- **Archivo Black**: display. Mayúsculas, `letter-spacing: -.02 a -.04em`, `line-height ≤ .94`.
  Números gigantes de evidencia con `font-variant-numeric: tabular-nums` (los count-up no
  bailan). El skew -7° es EXCLUSIVO del wordmark.
- **Inter Tight**: cuerpo (400/500/600) y también números de apoyo en instrumentos.
- **IBM Plex Mono**: SOLO capa forense: HUD, sellos, chips, labels de expediente, CTAs
  tipo terminal, loader. Uppercase + tracking ancho (.2-.3em).
- **PROHIBIDO** (regla directa de Fernando): eyebrows/kickers en mono uppercase microscópico
  como apertura de sección. El kicker estándar es **Inter Tight 600 legible + punto de color
  semántico** (`.kicker` con `i` circular cyan u óxido con glow).
- Texto fantasma: stroke sin fill (romanos de acto, frases de quiebre). Citas editoriales
  con comilla gigante óxido translúcida (`.pq`).
- Todo texto sobre arte lleva `text-shadow` scrim; si no alcanza, chip de vidrio
  (`backdrop-filter: blur` + borde translúcido) o scrim radial (`#ov7::before`).

## 4. Escenografía: el sitio es un teatro, el scroll es el director

Cada sección/pantalla es una **escena** con su propia puesta: decorado, utilería, actores
y luz. El sitio completo es una antología de sub-sitios (cada acto puede cambiar densidad,
ritmo y gramática de layout: la evidencia es editorial, el método son estaciones, la prueba
es un libro mayor) pero TODOS bajo la misma temática, los mismos tokens y los mismos verbos.
Variedad dentro del sistema; jamás una escena que parezca de otro sitio.

### 4.1 Bastidores: los elementos ENTRAN, no aparecen
- Nada se materializa en su lugar con un fade pelado. Todo elemento entra **desde fuera
  del escenario**: utilería e instrumentos desde los costados (`x: ±60-120` con una
  rotación leve de 2-4° que se endereza al asentarse), protagonistas desde la profundidad
  (scale .85→1 con blur que se disipa) o desde abajo, texto desde abajo con el split.
- La opacidad NUNCA viaja sola: siempre acompaña a un desplazamiento/transformación.
  `autoAlpha` + transform es el mínimo; el fade-in a secas está prohibido en elementos
  protagónicos.
- Cada elemento entra **según su rol**: el copy prepara (entra primero), el instrumento
  responde (entra después, offset .1-.3), los detalles rematan (callouts, sellos, motas).
  La entrada de una escena es una frase con sujeto, verbo y remate, no un stagger uniforme.

### 4.2 Las salidas importan tanto como las entradas
- Los sitios genéricos solo animan entradas. Acá **la salida se coreografía**: al abandonar
  una escena, sus elementos despejan el escenario (hacia el bastidor opuesto al de entrada,
  o replegándose al punto de origen) antes de que la siguiente escena monte la suya.
- Con scroll reversible, la coreografía se re-ejecuta: volver atrás re-monta la escena
  (`toggleActions: 'play none none reverse'` o scrub puro). El usuario tiene que poder
  "pasear" por las escenas como quien recorre salas: entrar, salir, volver a entrar.
- Umbrales entre escenas: transiciones de telón cuando el cambio de capítulo lo amerita
  (wipes por `clip-path`, cambio de luz del escenario, scrim que cierra y abre). El corte
  seco entre escenas es una decisión, no un default.

### 4.3 Profundidad y utilería persistente
- 2-3 planos de paralaje SUTIL: fondo (spine, numerales fantasma, texturas) más lento que
  el plano medio (instrumentos) y que el primer plano (copy). Diferencias chicas de
  velocidad (yPercent 8-20): profundidad de cine, no parque de diversiones.
- **Utilería persistente**: elementos que viajan entre escenas y cosen el mundo: la
  grieta/sutura (spine), el HUD, los sellos, el grain y la vignette. Toda experiencia
  larga necesita al menos un elemento continuo que atraviese las escenas y se transforme
  con la narrativa (como la grieta óxido que se vuelve sutura cyan).
- Cada escena debe tener **UNA idea escénica memorable** (su set piece). Si al describir
  la escena no podés nombrar su momento firma, la escena no está terminada.

## 5. SVG artesanal: la regla de oro

**Cada dato importante merece un instrumento propio, dibujado a mano o generado por código.**
Referencias vivas: matriz de 100 rombos, medidores con aguja, conteo carcelario, campana con
hatching, gráfica de ingresos escalonada, escáner de foto, retrato con grietas→suturas,
sliders con knob elástico, hilo de chat con barras de interés, sellos, glifos de planes.

Reglas:
1. **PROHIBIDO**: librerías de charts, íconos stock, emojis como UI, cards genéricas en
   grilla, ilustraciones flat de banco de imágenes. Si hace falta un ícono, se dibuja un
   glifo propio (48x48, stroke 2, geometría simple) como los de los planes.
2. Los instrumentos se construyen con primitivas: `createElementNS` + helpers (`mk()`),
   o inline SVG legible. Detalles que venden la artesanía: hatching en patterns, ojales,
   hebras sueltas, ticks de escala, ejes con `--line`.
3. Todo path importante se puede **dibujar**: `getTotalLength()` → dasharray/dashoffset
   (helper `setDraw()`). Es el verbo #1 del sistema.
4. `overflow: visible` en SVGs animados (los glows y pops no se recortan).
5. Los sellos van rotados (-1.5° a -7°) y entran con estampado (scale 1.8→1, power4.out).
6. Accesibilidad: SVG decorativo con `aria-hidden="true"`; si comunica, `role="img"` +
   `aria-label`. El wordmark es tipografía real seleccionable + SVG solo en las XX.

### 5.1 Doctrina de detalle máximo (no negociable)

**Cada SVG se diseña al nivel de detalle máximo que el conocimiento del diseñador permita.
Literalmente el máximo.** Un SVG de formas peladas es un boceto, no un instrumento; si un
instrumento tomó diez minutos, no está terminado. La vara de referencia son las XX del
wordmark (barras facetadas + gradiente + hebras con remate suelto + 8 ojales) y la campana
de Gauss (curva + área con hatching en pattern + línea de promedio punteada + bandera con
forma propia + anotación): esa densidad es el PISO, no el techo.

Todo instrumento se construye en **cinco capas**, y uno terminado tiene al menos cuatro:

1. **Estructura**: la geometría que comunica el dato (la curva, la aguja, la matriz).
2. **Material**: lo que hace que parezca un objeto y no un diagrama: hatchings en
   `<pattern>`, dasharrays con ritmo, gradientes sutiles, dobles trazos, facetados.
3. **Carácter/desgaste**: las imperfecciones que venden la artesanía: rotaciones leves,
   remates a mano, hebras sueltas, ojales, remaches, esquinas facetadas, irregularidad
   controlada (nada perfectamente simétrico salvo que la simetría signifique algo).
4. **Luz**: glows semánticos, rims, halos, sombras internas; la luz obedece la regla de
   color (sección 2).
5. **Información**: ticks de escala, unidades, labels, fuentes citadas, números tabulares.
   Un instrumento sin escala es decoración.

Reglas de construcción:
- **El detalle se diseña para ser animado**: agrupar en `<g>` por capa y por momento de
  entrada, con clases por rol. Un detalle que no puede animarse independiente está mal
  agrupado. Los micro-detalles (motas, ojales, ticks) tienen su propio beat en la
  coreografía: son el remate de la frase.
- Antes de dar por terminado un SVG, la prueba del zoom: ampliado al doble, ¿sigue
  habiendo detalle que descubrir? Si al acercarse se vacía, le falta una capa.
- El nivel de detalle es parejo en todo el sistema: un instrumento pobre al lado de uno
  rico rompe la ilusión de mundo. Si no hay tiempo para hacerlo bien, no se muestra
  todavía; jamás se shipea la versión pelada "para después".

## 6. Vocabulario de motion (los verbos del sistema)

Usar SIEMPRE estos verbos antes de inventar uno nuevo:

| Verbo | Implementación canónica | Uso |
|---|---|---|
| **Dibujar** | dashoffset → 0, `power2.inOut`, .4-1.6s | trazos, curvas, suturas, reglas |
| **Pop** | scale 0→1, `back.out(1.7-2.6)`, stagger .04-.18 | puntos, ojales, callouts, flags |
| **Aguja/knob** | `elastic.out(1, 0.55-0.6)`, 1.1-1.6s | medidores, sliders |
| **Count-up** | proxy `{v}` + onUpdate, `power2.out`, tabular-nums, locale es-AR (coma decimal) | todo número que importa |
| **Split de titular** | chars `yPercent 115, rotateZ 3` → 0, `power3.out`, stagger amount .45, agrupado por palabra (`.wd` nowrap) | headlines |
| **Regla** | scaleX 0→1 desde el borde narrativo | subrayado de evidencia |
| **Decode/scramble** | set `01%×#/·—▏▶`, revela por índice | SOLO textos mono forenses |
| **Estampar** | scale 1.8→1 + rotación fija, `power4.out`, .4s | sellos, veredictos |
| **Pulso** | scale/glow yoyo 1-3 repeticiones, `sine.inOut` | corazón, halos de éxito |
| **Tachado** | width 0→104% rotado -1.5° | ideas que la marca destruye |
| **Fade estructural** | `y: 24-40, autoAlpha: 0`, `power2.out`, .6-.8s, stagger .12-.16 | bloques de copy/arte |

Reglas de easing: entradas `power2/power3.out`; dibujos `power2.inOut`; orgánico/juguetón
`back.out` y `elastic.out`; NADA con ease lineal salvo marquees/scrubs. Duraciones de
entrada .4-.9s. **Nunca** easings default de CSS ni `all .3s ease`.

### Dos modos de coreografía (no mezclarlos)
- **Modo película (scrub)**: en experiencias narrativas largas, el scroll ES el tiempo.
  Timelines `paused: true` + `.progress(e)` mapeado a progreso, determinístico y reversible.
  Movimiento monotónico (nada "respira" al invertir). Lenis (`lerp .09`) + ScrollTrigger
  `scrub .6-1`.
- **Modo documento (trigger)**: bloques que entran al verse: `start: 'top 76-84%'`,
  `toggleActions: 'play none none reverse'`. Cada bloque cuenta una mini-historia con
  layering temporal (el arte entra DESPUÉS del copy: offsets .1-.3).
- En la APP (sin scroll narrativo): los verbos son los mismos pero time-based al montar
  o al cambiar de estado. Una pantalla de app entra como un `.viz`: copy → instrumento →
  detalle, con los mismos easings y staggers.

### 6.1 La vara de diferenciación (por qué existe todo esto)

La animación acá NO es polish: es la ventaja competitiva. La vara concreta:

1. **La prueba del template**: si una animación podría venir en un template de Framer/
   Webflow o en un ejemplo de documentación, se rehace. El fade-up genérico con stagger
   uniforme es el uniforme de todos los SaaS: nosotros no lo usamos como plato principal.
2. **Los momentos héroe son timelines, no tweens**: cualquier momento importante (revelar
   un score, sellar un veredicto, completar un análisis) se coreografía con 3+ elementos
   en offsets escalonados que cuentan una secuencia causal. Un tween suelto de una
   propiedad es para transiciones menores, nunca para el clímax.
3. **Cada pantalla tiene su set piece**: una animación que alguien grabaría y compartiría
   (el escáner, la aguja elástica, la sutura cosiéndose, el estampado del veredicto).
   El set piece siempre cuenta la historia del producto, no decora: la animación ES el
   argumento de venta hecho movimiento.
4. **Micro-interacciones tematizadas**: hover, focus, click y error también hablan el
   idioma (glow semántico que crece, knob elástico, tachado óxido en lo inválido). Un
   `:hover` con cambio de color a secas es un hueco en el mundo.
5. **La diferenciación se audita**: en el QA visual (sección 9) se responde por escrito
   cuál es el set piece de la pantalla y qué la diferencia de un template. Sin respuesta,
   no se shipea.

## 7. Texturas y capa cinematográfica

- **Grain** fijo (feTurbulence data-URI, opacity ~.05, steps(4)) animado por
  `background-position` con `inset: 0` (NUNCA inset negativo + transform: expande el
  viewport en mobile real).
- **Vignette** radial fija que oscurece bordes.
- **Loader temático**: "CARGANDO EXPEDIENTE · N%" en mono + barra fina. Nunca spinner
  genérico ni skeleton gris estándar.
- Fondos de instrumento `#141922` con `border-radius: 16px`; fichas importantes con
  esquinas facetadas por `clip-path` (polygon 16px) y línea superior semántica.
- Profundidad por glow y drop-shadow semánticos, no por sombras grises de material design.

## 8. Performance y craft técnico (no negociable)

1. Animar SOLO `transform`, `opacity`, `stroke-dashoffset` y atributos SVG puntuales.
   Nada que dispare layout en loop.
2. Canvas: DPR cap a 2; re-aplicar `imageSmoothingQuality` tras resize (el resize resetea
   el contexto); draw tipo cover centrado.
3. Assets pesados: póster primero, precarga por oleadas con concurrencia (~14), fallback
   al frame cargado más cercano, mobile con stride (mitad de frames).
4. `overflow-x: clip` en body, NUNCA `hidden` (rompe `position: sticky` en Chromium).
5. `will-change` solo en lo que realmente se anima por carácter.
6. Nada puede medir más que el viewport en mobile (gotcha real de layout viewport).
7. `prefers-reduced-motion`: loops apagados y estados finales visibles al instante.
   La información nunca depende de la animación.
8. Fuentes por `<link>` con preconnect, jamás `@import` en `<style>`.

## 9. QA visual obligatorio

Ninguna superficie se declara lista sin:
1. **Hooks de QA determinísticos** incorporados (`?tl=0..1`, `?sec=N`, `&debug=1` en la
   landing; la app expone estados forzables equivalentes, por ej. `?estado=analizando`).
2. Screenshots verificados en al menos 5-6 momentos/estados clave, desktop y mobile 390px.
3. Gotchas conocidos del entorno: headless Edge ignora meta viewport (mín ~500px físicos,
   no sirve para QA mobile real), Windows al 125% distorsiona el mapeo de tamaño.
4. Para video generado (Veo/Flow): checklist de SHOTLIST-V3 (toma única, monotónico,
   color en banda, último medio segundo quieto, sin motion blur pesado).

## 10. Traducción a la APP (el estándar para /auditoria y el producto)

La app NO es "un formulario con la paleta". Es la continuación del expediente:

- **Subida de fotos**: mesa de evidencia. Las fotos son pruebas numeradas
  (`FOTO 01 … FOTO 09` en mono), entran con pop/estampado, el dropzone es un marco de
  expediente, no un rectángulo punteado genérico.
- **Pantalla de espera (25-60s, la pantalla más importante del funnel)**: el escáner de
  `st-audit` a pantalla completa: scanline cyan recorriendo las fotos, callouts que van
  apareciendo con pop, HUD con estado en mono ("ANALIZANDO EVIDENCIA · FOTO 3/6" →
  "SINTETIZANDO VEREDICTO"), progreso semántico. El usuario tiene que QUERER esperar.
- **Resultado**: un informe forense, no un dashboard. Score con count-up + medidor de
  aguja; arquetipo revelado con estampado; evidencia por foto con callouts; veredictos
  duros en óxido, quick wins y mejoras en cyan; sello de garantía.
- Formularios e inputs con el ADN del sistema: fondos surface, bordes `--line`, focus con
  glow semántico, labels mono cuando son forenses.
- CTAs: bloque cyan sólido, texto void, hover `translateY(-3px)` + glow que crece.
  Fichas/cards importantes: hover `translateY(-8px)`.

## 11. Lista negra (resumen de lo prohibido)

Eyebrows mono como headers de sección · cards genéricas en grilla · librerías de charts ·
íconos stock y emojis UI · spinners/skeletons genéricos · púrpura/rosa/coral/gradientes
calientes · glow blanco genérico · `all .3s ease` · easings lineales en entradas ·
`overflow-x: hidden` en body · `@import` de fuentes · grain con inset negativo ·
animar propiedades de layout · cyan antes de la solución · texto ilegible sobre arte ·
fade-in pelado sin desplazamiento en elementos protagónicos · entradas sin salida
coreografiada · SVGs de formas peladas sin capas de material/carácter/luz/información ·
escenas sin set piece nombrable · animaciones que podrían venir de un template ·
cualquier pantalla que podría ser de otro SaaS.

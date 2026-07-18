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

## 4. SVG artesanal: la regla de oro

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

## 5. Vocabulario de motion (los verbos del sistema)

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

## 6. Texturas y capa cinematográfica

- **Grain** fijo (feTurbulence data-URI, opacity ~.05, steps(4)) animado por
  `background-position` con `inset: 0` (NUNCA inset negativo + transform: expande el
  viewport en mobile real).
- **Vignette** radial fija que oscurece bordes.
- **Loader temático**: "CARGANDO EXPEDIENTE · N%" en mono + barra fina. Nunca spinner
  genérico ni skeleton gris estándar.
- Fondos de instrumento `#141922` con `border-radius: 16px`; fichas importantes con
  esquinas facetadas por `clip-path` (polygon 16px) y línea superior semántica.
- Profundidad por glow y drop-shadow semánticos, no por sombras grises de material design.

## 7. Performance y craft técnico (no negociable)

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

## 8. QA visual obligatorio

Ninguna superficie se declara lista sin:
1. **Hooks de QA determinísticos** incorporados (`?tl=0..1`, `?sec=N`, `&debug=1` en la
   landing; la app expone estados forzables equivalentes, por ej. `?estado=analizando`).
2. Screenshots verificados en al menos 5-6 momentos/estados clave, desktop y mobile 390px.
3. Gotchas conocidos del entorno: headless Edge ignora meta viewport (mín ~500px físicos,
   no sirve para QA mobile real), Windows al 125% distorsiona el mapeo de tamaño.
4. Para video generado (Veo/Flow): checklist de SHOTLIST-V3 (toma única, monotónico,
   color en banda, último medio segundo quieto, sin motion blur pesado).

## 9. Traducción a la APP (el estándar para /auditoria y el producto)

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

## 10. Lista negra (resumen de lo prohibido)

Eyebrows mono como headers de sección · cards genéricas en grilla · librerías de charts ·
íconos stock y emojis UI · spinners/skeletons genéricos · púrpura/rosa/coral/gradientes
calientes · glow blanco genérico · `all .3s ease` · easings lineales en entradas ·
`overflow-x: hidden` en body · `@import` de fuentes · grain con inset negativo ·
animar propiedades de layout · cyan antes de la solución · texto ilegible sobre arte ·
cualquier pantalla que podría ser de otro SaaS.

# Percentil Cinema (landing v3) - guion técnico de generación
### Workflow keyframes-first para Google Flow / Veo · v3 del documento

Master sequence de 4 shots de un corazón de obsidiana para scroll-scrubbing frame a frame.
Técnica: generar PRIMERO 5 stills clave (K0-K4) y validarlos como sistema; después generar
cada shot como interpolación entre dos stills consecutivos (Frames to Video: start + end).
El último frame del shot N ES el primer frame del shot N+1: continuidad garantizada.

**Sobre la longitud de estos prompts:** están en el sweet spot de Veo (~120-220 palabras
densas). Más largo no es mejor: pasado ese punto el modelo promedia e ignora. La regla es
especificidad sin contradicción: cada palabra decide algo (material, luz, cámara, física).
Cada prompt es AUTOCONTENIDO: se pega entero tal cual, sin armar piezas.

---

## NEGATIVE PROMPT (pegar en el campo negative de TODOS los stills y shots)

> text, watermark, logo, subtitles, purple, magenta, pink, violet glow, bright saturated
> red, yellow fire, white background, bright background, lens flare, light streaks,
> bokeh circles, camera shake, handheld wobble, cuts, scene transition, crossfade,
> flash frames, human hands, anatomical heart, blood, cartoon, illustration, low poly
> game asset look, plastic material, glossy toy, oversaturation, HDR halos

Por qué: los modelos derivan a púrpura/rosa/flares con temas "corazón" (territorio Tinder,
prohibido por marca); el bokeh y los flares parpadean entre frames y el scrub los convierte
en ruido; "anatomical heart / blood" evita el gore accidental; "plastic/toy" fuerza el
material noble.

---

## PASO 1 - Los 5 keyframes (stills)

Generar K0 primero. Para K1-K4 usar K0 como imagen de referencia/ingredient: MISMO corazón
(misma geometría de facetas, mismo material, misma luz). No aprobar ninguno hasta ver los
5 lado a lado: mismo objeto, mismo fondo, misma temperatura, corazón siempre centrado.

Encuadre para todos: corazón centrado, ~52% de la altura del frame, siempre dentro del
tercio central horizontal (safe area para el crop 9:16 de mobile).

### K0 - INTACTO (inicio shot 1)

> Ultra-detailed photorealistic 3D render, macro product photography style. A heart-shaped
> sculpture of dark volcanic obsidian, built from large irregular geometric facets like a
> hand-cut gemstone, each facet slightly different in size, separated by fine hairline
> seams. The surface is matte black glass with subtle brushed-graphite texture: faint
> micro-scratches, a whisper of settled dust on the upper facets, edges softly chamfered
> so they catch light as thin cold lines. It floats weightlessly, perfectly centered, in
> an infinite charcoal-blue void that falls to near-black in every direction, with the
> faintest volumetric haze giving depth. Lighting: one single cold key light from the
> upper left at roughly 45 degrees, slightly blue like moonlight, tracing a crisp rim
> along the left lobe and upper edges; a very low ambient fill so shadow facets remain
> readable but deep; no visible light source, background stays darker than the subject.
> Fine dust motes hang motionless in the beam. Shot on a 100mm macro lens at f/2.8,
> shallow depth of field, eye-level, the heart angled three-quarters toward camera,
> occupying about half the frame height. Color grade: cold graphite-blue, crushed blacks,
> highlights never clipping, filmic and restrained. Mood: dormant, forensic, monumental
> — a museum artifact in a vault. Completely intact, serene, no cracks, no glow.

### K1 - PRIMERA GRIETA (fin shot 1 = inicio shot 2)

> The exact same dark faceted obsidian heart as the reference image, identical framing,
> identical camera angle, identical cold upper-left key light and charcoal-blue void.
> One single change: a thin hairline fracture now runs diagonally across its upper-left
> lobe, following the seams between two facets, like a crack in tempered glass. From
> inside the fracture seeps a faint, deep rust-orange ember glow — the color of cooling
> lava or oxidized iron, burnt and desaturated, never yellow, never bright red. The glow
> is dim: it illuminates only the inner walls of the crack and casts the faintest warm
> edge onto the two adjacent facets, while the rest of the heart remains cold, dark and
> intact. A few microscopic glowing particles hang just outside the fissure. The contrast
> tells the story: one warm wound on a cold body. Same 100mm macro lens, f/2.8, same
> shallow depth of field, same composition with the heart centered at half frame height.
> Same cold graphite-blue grade with crushed blacks; the ember is the only warm note in
> the entire image. Mood: the first symptom, quiet and ominous.

### K2 - CORROÍDO (fin shot 2 = inicio shot 3)

> The same faceted obsidian heart as the reference image, same charcoal-blue void and
> cold upper-left key light, camera now perceptibly closer — the heart fills about
> two-thirds of the frame height, still perfectly centered. Its entire surface is now
> covered by a branching web of glowing fractures that follow the facet seams, like
> living veins of ember: deep rust-orange, burnt and desaturated, the color of corroding
> iron and cooling lava, never yellow, never bright red. The glow pulses stronger near
> the original upper-left wound and thins toward the lower tip. Several small flakes of
> oxidized black metal have lifted a few millimeters off the surface and hang suspended,
> each catching a sliver of ember light on its underside. Thin wisps of dark particulate
> drift off the hottest fissures like slow smoke. The heart is visibly strained but still
> whole — a structure one breath away from failure. The rust glow now provides a soft
> secondary light source from within, warming the immediate haze around the heart while
> the background void stays near-black and cold. Same 100mm macro, f/2.8, shallow depth
> of field. Grade: cold graphite-blue base with the ember network as the only warmth.
> Mood: ominous, forensic, the autopsy of a failure in progress.

### K3 - ROTO (fin shot 3 = inicio shot 4)

> The same obsidian heart, now shattered: a frozen explosion suspended in the
> charcoal-blue void. The heart has broken into roughly a dozen large angular fragments
> along its facet seams, drifted apart but still clearly composing the ghost of the
> heart's silhouette, like an exploded-view engineering diagram. Camera slightly wider
> than before — the debris field occupies about two-thirds of the frame width, centered.
> Each fragment shows two faces: the outer face of cold matte obsidian catching the blue
> upper-left key light, and the inner fractured face glowing with dim rust-orange ember,
> burnt and desaturated like cooling lava, never yellow. Between the fragments float
> smaller shards, glowing embers and fine dust, all motionless, hanging in time. Faint
> warm light bounces between the inner faces; the void behind remains near-black. The
> composition reads as tragic and monumental, absolute stillness after violence — a
> crime-scene photograph in zero gravity. Same 100mm macro lens at f/4 for slightly
> deeper focus across the debris, eye-level, shallow falloff into darkness. Grade: cold
> graphite-blue dominant, ember warmth confined to the inner faces. No motion blur
> anywhere: everything tack sharp, suspended.

### K4 - KINTSUGI (fin shot 4, frame final del sitio)

> The same obsidian heart, whole again, floating perfectly centered in the charcoal-blue
> void at the same size and camera angle as the very first reference image. The fragments
> have fused back together, and every former fracture line is now sealed with a vein of
> calm teal-cyan light — like kintsugi performed with liquid light instead of gold. The
> cyan is precise and serene: a soft aqua-teal, never electric blue, never neon. The
> veins glow gently from within the seams, tracing the geometry of the facets, slightly
> brighter at the junctions where several seams meet. There is no orange light left
> anywhere in the image — the corrosion is gone. The cyan glow acts as a delicate
> secondary light source: it lifts the nearby dust motes into visibility and casts a
> soft cool sheen onto the surrounding haze, while the cold upper-left key light still
> shapes the outer facets as in the beginning. The heart looks stronger than when it was
> intact: visibly repaired, wearing its history as light. Same 100mm macro, f/2.8,
> shallow depth of field, crushed blacks, filmic restraint. Mood: serene, reborn,
> quietly triumphant — the exhale after the whole story.

**Nota de color CRÍTICA:** ember = óxido desaturado (referencia `#C94B32`, lava
enfriándose), jamás amarillo ni rojo vivo. Cyan = teal calmo (referencia `#4FD9C2`),
jamás azul eléctrico. Si un still deriva, regenerar el STILL (es lo barato).

---

## PASO 2 - Los 4 shots (Frames to Video: start frame + end frame + prompt de motion)

Cada shot: **8 segundos**, máxima resolución, UNA toma continua. Los prompts incluyen
coreografía con marcas de tiempo: Veo las respeta razonablemente y son la mejor
herramienta para que el movimiento sea monotónico (crítico para el scrub).

### shot-1.mp4 - EL LATIDO · start: K0 → end: K1

> Single continuous shot, no cuts. A dark faceted obsidian heart floats centered in a
> near-black charcoal-blue void, lit by one cold key light from the upper left, fine
> dust motes drifting slowly upward through the beam. The camera orbits left around the
> heart extremely slowly — about ten degrees over the full duration, constant speed,
> tripod-smooth, no shake. Choreography: from 0 to 3 seconds the heart gives one slow,
> subtle heartbeat, expanding barely three percent and settling; from 3 to 5 seconds a
> second, slightly weaker heartbeat; from 5 to 7 seconds a thin hairline fracture opens
> silently across its upper-left lobe, propagating along the seams between facets, and
> a faint deep rust-orange ember glow — like cooling lava, desaturated, never yellow —
> seeps from inside the crack; from 7 to 8 seconds everything settles and holds
> completely still. The lighting, framing and color never change otherwise: cold
> graphite-blue grade, crushed blacks, the ember glow as the only warm note appearing
> late in the shot. Photorealistic macro render, 100mm lens, shallow depth of field,
> slow constant-speed motion throughout, no speed ramps, no flicker.

### shot-2.mp4 - LA CORROSIÓN · start: K1 → end: K2

> Single continuous shot, no cuts. The dark obsidian heart with a single glowing
> hairline crack on its upper-left lobe floats centered in the near-black void. The
> camera pushes in very slowly — a gentle constant dolly-in of about fifteen percent
> over the full duration, tripod-smooth. Choreography: from 0 to 6 seconds the
> rust-orange fracture propagates steadily across the entire surface, branching along
> the seams between facets like living veins of ember, the glow intensifying gradually
> and evenly — deep burnt orange like corroding iron and cooling lava, never yellow,
> never bright red; from 4 seconds onward a few small flakes of oxidized black metal
> lift slowly off the hottest fissures and hang suspended, and thin wisps of dark
> particulate drift upward like slow smoke; from 7 to 8 seconds the propagation
> completes and everything settles and holds completely still. The spread is strictly
> forward: cracks never retract or heal. Cold graphite-blue grade with the ember
> network as the only warmth, background stays near-black, dust motes drift slowly.
> Photorealistic macro render, 100mm lens, shallow depth of field, constant-speed
> motion, no speed ramps, no flicker.

### shot-3.mp4 - LA RUPTURA · start: K2 → end: K3

> Single continuous shot, no cuts. The obsidian heart covered in glowing rust-orange
> fractures floats centered in the near-black void. The camera pulls back slowly and
> steadily — about fifteen percent over the full duration, tripod-smooth — revealing
> more of the void as the event unfolds. Choreography: from 0 to 1 second the ember
> glow surges once, the heart strains; at 1 second the heart breaks apart in extreme
> slow motion along its facet seams, roughly a dozen large angular fragments separating
> and drifting steadily outward, each rotating very slightly, motion strictly outward
> and never retracting; glowing embers, smaller shards and dust release with them and
> drift along; from 1 to 7 seconds the expansion decelerates gradually and evenly, like
> an explosion filmed at ten thousand frames per second; from 7 to 8 seconds all
> fragments hang suspended and motionless, composing the ghost of the heart's
> silhouette — a frozen explosion. Outer fragment faces stay cold matte obsidian under
> the blue key light; inner fractured faces glow dim rust-orange, desaturated, never
> yellow. No motion blur, everything stays sharp. Cold graphite-blue grade, crushed
> blacks, constant lighting. Photorealistic macro render, no speed ramps, no flicker.

### shot-4.mp4 (VERSIÓN ADAPTADA AL MATERIAL REAL) · start: k3.png extraído → end: K4
Contexto: el shot 3 real quedó con la cámara DENTRO de la explosión (frame lleno de
escombros, sin silueta del corazón). Este prompt aprovecha eso: la cámara retrocede
mientras los fragmentos convergen. Usar `landing/assets/master/keyframes/k3.png` como
start frame.

> Single continuous shot, no cuts. The camera is inside a suspended debris field of
> shattered dark glass and obsidian fragments with glowing ember edges, warm smoke
> hanging in a dark void. Choreography: from 0 to 2 seconds the camera begins a slow,
> steady pull-back, tripod-smooth, and every fragment starts drifting toward a single
> point at the center of the frame, strictly inward, never scattering; from 2 to 5
> seconds the camera keeps retreating as the fragments converge and fuse into a large
> faceted obsidian heart, revealed whole and centered as the debris clears, while the
> orange ember light fades out completely and the warm smoke dissipates, the scene
> cooling into a clean near-black charcoal-blue void; as each seam of the heart closes
> it ignites with a calm teal-cyan glow like kintsugi veins of liquid light — soft aqua
> teal, never electric blue; from 5 to 7 seconds the restored heart, centered and
> occupying about half the frame height, gives one slow gentle pulse of its cyan veins;
> from 7 to 8 seconds everything holds completely still, serene, cold graphite-blue
> grade with the cyan veins as the only accent, fine dust motes drifting. Photorealistic
> macro render, shallow depth of field, constant-speed motion, no speed ramps, no flicker.

### shot-4.mp4 (versión original del guion) · start: K3 → end: K4

> Single continuous shot, no cuts. A dozen angular obsidian fragments hang suspended in
> the near-black charcoal-blue void, their inner faces glowing dim rust-orange, composing
> the ghost of a shattered heart. The camera holds nearly static, drifting forward
> almost imperceptibly, tripod-smooth. Choreography: from 0 to 5 seconds the fragments
> drift slowly and steadily back inward along the exact reverse of their outward paths,
> rotating gently into alignment, and fuse together one by one; as each seam closes it
> ignites with a calm teal-cyan glow, like liquid light sealing the joint — soft aqua
> teal, never electric blue, never neon; simultaneously the rust-orange ember light
> fades out gradually, disappearing completely by the 5 second mark; from 5 to 7 seconds
> the restored heart, now whole and traced by glowing cyan kintsugi veins along every
> former fracture, gives one slow gentle pulse of its veins, the glow swelling softly
> and settling; from 7 to 8 seconds everything holds completely still, the heart
> centered and serene, cyan veins glowing calmly, dust motes lifted into visibility by
> the cool glow. The motion is strictly inward, nothing drifts apart again. Cold
> graphite-blue grade, crushed blacks, the cyan as the only accent. Photorealistic
> macro render, 100mm lens, shallow depth of field, constant-speed motion, no speed
> ramps, no flicker.

---

## PASO 3 - QA de cada clip antes de aprobarlo

- [ ] Una sola toma, cero cortes, cero flashes, cero crossfades "trampa" del modelo
      (si disuelve en vez de mover físicamente, regenerar).
- [ ] Primer y último frame coinciden con sus keyframes.
- [ ] Movimiento monotónico: nada retrocede ni "respira" a mitad de shot
      (el scrub invertido lo delata).
- [ ] Color: fondo casi negro azulado, ember óxido (no amarillo/rojo vivo), cero
      púrpura/rosa/flares, cyan SOLO en shot 4 y recién desde que sella el primer seam.
- [ ] Corazón/fragmentos dentro del tercio central horizontal todo el shot (crop mobile).
- [ ] Último medio segundo completamente quieto.
- [ ] Sin motion blur pesado (los frames congelados del scrub lo delatan como manchas).

## Red de seguridad
- Flow sin end frame en algún modo → encadenar por start frames y avisarme: agrego un
  dissolve de 4-6 frames en los empalmes dentro del motor de scrub (invisible).
- Drift leve de temperatura entre shots → NO regenerar: lo corrijo con ffmpeg
  (curvas/eq por shot, calibrando contra los stills). Regenerar solo si hay
  púrpura/rosa o el drift es grosero.
- Guardar los 5 stills en `landing/assets/master/keyframes/` (k0.png ... k4.png):
  los uso como pósters de precarga y para calibrar color.

## Entrega
`landing/assets/master/shot-1.mp4` ... `shot-4.mp4` + `keyframes/k0.png` ... `k4.png`.

## PIPELINE EJECUTADO (2026-07-17) - estado real
- 4 shots recibidos (s1/s2/s4: 1080p 8s 192f; s3: 720p 3s 72f). Extracción FINAL:
  **resolución nativa, sin crop, webp q88** → 360 frames, 64MB (`assets/frames/`).
  Calidad primero por decisión de Fernando; watermark Veo queda (lo resuelve él o viñeta).
- Motor: `landing/cinema.html`. Canvas scrub + Lenis + ScrollTrigger. Dissolve de 5 frames
  en empalmes s2→s3 y s3→s4. Mobile carga 1 de cada 2 frames.
- Motion graphics de texto (todo scrub-driven, determinístico): HUD forense (sello +
  contador FRAME en vivo + acto + barra de progreso óxido→cyan), evidencias numeradas
  ancladas a bordes con count-up y regla que se dibuja, eyebrows con efecto decodificación,
  titulares con reveal por carácter (split agrupado por palabra), "ES TU SEÑAL." en outline
  stroke. Intro del hero time-based una sola vez al cargar.
- Gotchas de QA aprendidos: (1) el headless de Edge ignora el meta viewport y tiene ancho
  mínimo ~500px físicos: NO sirve para QA mobile real, solo valida media queries y overflow;
  (2) `.grain` con `inset:-100px` + transform expande el layout viewport en mobile real:
  animar `background-position` con `inset:0` (aplicado en cinema y v2);
  (3) Windows al 125% de escala distorsiona el mapeo window-size→CSS px en headless.
- Hook QA: `?tl=0..1` (progreso sin scroll) y `?tl=..&debug=1` (mide viewport + elemento
  más ancho de la página, imprime en el CTA).

## Sync de copy previsto (se ajusta al material real)
- Shot 1: sello EXPEDIENTE 001 + "EL MERCADO ESTÁ TORCIDO." sobre los latidos;
  el "2%" entra junto con la primera grieta (~seg 5-7 del shot).
- Shot 2: 44% y 22× cayendo con la propagación.
- Shot 3: "NO ES TU CARA. ES TU SEÑAL." en la suspensión final.
- Shot 4: "PODEMOS MOVERTE DE LUGAR." cuando sella el último seam + CTA cyan en el pulso.

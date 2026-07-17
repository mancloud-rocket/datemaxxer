# Landing "Kintsugi de Acero" - estado y plan de motion

**Estado al 2026-07-17 (v2):** COMPLETO. `index.html` tiene estructura + CSS + capa de motion
GSAP/Lenis implementada y verificada con QA visual headless (paleta Óxido aplicada, review de
CORE respondido). Los clips de Flow/Veo siguen pendientes pero no bloquean (fallbacks CSS activos).
La spec del timeline de abajo quedó implementada tal cual; se conserva como documentación.

## Concepto (para quien retome)
Corazón low-poly de acero (13 shards, SVG `#heart`). Narrativa scroll en 4 actos dentro
del sticky stage (`.cinema-track` = 760vh, `.stage` = sticky 100vh):
- Acto 0 hero: corazón late, copy "El mercado está torcido".
- Acto 1 evidencia: 3 stats (`#stat-1/2/3`); cada una dibuja grietas ámbar (`#cracks path`).
- Acto 2 ruptura: los 13 shards vuelan (translate+rotate), copy "No es tu cara. Es tu señal."
- Acto 3 kintsugi: shards vuelven, costuras cyan (`#seams path`) se dibujan con glow,
  copy "Podemos moverte de lugar". Cyan SOLO acá y en el CTA (regla de marca).
Después scroll normal: `.protocol` (3 glass cards con reveal) y `.finale` (CTA).

## Spec de la capa JS (implementar en `<!-- JS:MOTION -->`)

1. **Lenis + GSAP wiring** (estándar):
   `const lenis = new Lenis({lerp:.09}); lenis.on('scroll', ScrollTrigger.update);`
   `gsap.ticker.add(t => lenis.raf(t*1000)); gsap.ticker.lagSmoothing(0);`
   `gsap.registerPlugin(ScrollTrigger);`

2. **Prep de trazos:** para cada `#cracks path` y `#seams path`:
   `const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L;`

3. **Prep de shards:** para cada `#shards polygon` calcular centroide desde `points`,
   dirección = centroide - centro del corazón (200,195) normalizada. Guardar
   `{dx, dy}` * distancia 220-420 (determinística por índice, ej. `240 + (i*53)%180`)
   y rotación `(i%2 ? 1 : -1) * (12 + (i*7)%28)` grados.

4. **Latido ambiente:** `gsap.to('#heartInner', {scale:1.03, transformOrigin:'200px 195px', duration:.9, yoyo:true, repeat:-1, ease:'sine.inOut'})`. Pausarlo durante la ruptura (timeline callback).

5. **Master timeline** scrubbed contra `#cinema` (`start:'top top', end:'bottom bottom', scrub:.8`).
   Posiciones (0-1 del track):
   - 0.00-0.08: `#act-hero` y `#scrollHint` fade out; corazón scale 1 → 1.12.
   - 0.08-0.16: `#stat-1` in/out + crack[3] (K4) se dibuja (dashoffset → 0). `#tintSodium` opacity → .8.
   - 0.16-0.24: `#stat-2` in/out + cracks[4] y [0] (K5, K1 central).
   - 0.24-0.33: `#stat-3` in/out + cracks[1] y [2] (K2, K3) + jitter del corazón
     (x: -3/+3 keyframes rápidos, como temblor).
   - 0.33-0.52: RUPTURA. Cada shard a su `{dx, dy, rotation}` con stagger .012,
     ease 'power3.out'. Cracks fade out (opacity → 0). `#act-break` in a 0.38, out a 0.50.
     `window.__burst = 1` durante este rango (callback onUpdate) para el canvas de polvo.
   - 0.52-0.72: KINTSUGI. Shards vuelven a 0 (ease 'power2.inOut', stagger .012 desde el centro),
     seams se dibujan (dashoffset → 0, stagger .06), `#heartGlow` opacity → 1,
     `#tintSodium` → 0, `#tintSignal` → .9.
   - 0.72-0.90: `#act-turn` in (l1 primero, l2 +.4). Corazón scale → .92 (cede protagonismo al copy).
   - 0.90-1.00: hold (nada nuevo; deja respirar antes del unpin).

6. **Canvas `#dust`:** ~60 motas (x, y, r .5-1.6, vy -.1 a -.35, alpha .05-.25),
   color steel `91,102,114`; cuando `__burst > 0` multiplicar velocidad ×6 y
   30% de motas en ámbar `232,176,75`. Resize handler. rAF propio (no depende de GSAP).

7. **Reveals post-cine:** `.protocol-head` y cada `.card` con
   `gsap.from(..., {y:44, opacity:0, stagger:.12, scrollTrigger:{trigger, start:'top 78%'}})`.
   Igual `.finale` (heart-mark + h2 + cta staggered).

8. **QA hooks (implementados):** `?seek=0.5` scrollea a ese punto (test manual en browser).
   `?tl=0.5` fija el progreso del timeline SIN scroll: es el único modo que sirve para
   screenshots headless, porque `--screenshot` de Edge captura siempre el tope del documento
   e ignora la posición de scroll. Gotcha aprendido: `overflow-x:hidden` en body rompe
   `position:sticky` del stage; usar `overflow-x:clip`.

## QA (pipeline conocido: Edge headless)
```
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu `
  --window-size=1440,900 --virtual-time-budget=8000 `
  --screenshot=out.png "file:///.../landing/index.html?seek=0.4"
```
Sacar seeks 0 / .2 / .4 / .62 / .85 + una pasada mobile (`--window-size=390,844`).
Verificar: legibilidad de stats sobre el corazón, que el cyan NO aparezca antes del acto 3,
solapes en mobile (stats van abajo, `@media` ya lo maneja).

## Clips a generar (Google Flow / Veo) - van en `assets/clips/`
Todos 4-5s, loop limpio, oscuros (deben convivir con #101318), sin texto, sin caras.
| Archivo | Prompt sugerido |
|---|---|
| `hero-ambient.mp4` | "Slow drifting metallic dust and faint smoke in a dark void, cold blue-grey palette, macro cinematic lighting, seamless loop, no subject" |
| `clip-audit.mp4` | "Macro shot of a thin warm amber light beam scanning across brushed dark steel surface, forensic mood, seamless loop" |
| `clip-kit.mp4` | "Extreme macro of molten gold slowly filling a crack in dark grey stone, kintsugi repair, shallow depth of field, seamless loop" |
| `clip-copilot.mp4` | "Minimal cyan signal waveform pulsing softly in dark space, subtle glow, oscilloscope aesthetic, seamless loop" |
Si un clip no está, el HTML ya cae solo al fallback CSS animado (clase `no-clip`), así que
la página funciona 100% sin assets.

## Audio (idea ElevenLabs, opcional, no bloqueante)
Toggle de sonido discreto: latido grave y lento en actos 0-1, crack seco en la ruptura,
tono limpio ascendente en el kintsugi. Un solo archivo con sprites o 3 archivos cortos.

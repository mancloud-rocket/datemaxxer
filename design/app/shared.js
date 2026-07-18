/* =====================================================================
   DATEMAXXER · design/app · helpers compartidos (GSAP requerido)
   Los verbos canónicos de GUIA-VISUAL §6, listos para las pantallas.
   ===================================================================== */
const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
};
const setDraw = p => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; return L; };
const qsParam = k => new URLSearchParams(location.search).get(k);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* count-up canónico: tabular-nums + coma decimal es-AR */
function countTo(el, to, opts = {}) {
  const o = { v: parseFloat(el.textContent) || 0 };
  const dec = opts.dec || 0;
  return gsap.to(o, {
    v: to, duration: opts.duration || 1.1, ease: opts.ease || 'power2.out',
    onUpdate: () => { el.textContent = o.v.toFixed(dec).replace('.', ','); },
  });
}

/* decode/scramble: SOLO textos mono forenses */
const SCRAMBLE_SET = '01%×#/·—▏▶';
function decodeTo(el, text, dur = .7) {
  const o = { t: 0 }; const n = text.length;
  return gsap.to(o, {
    t: 1, duration: dur, ease: 'none',
    onUpdate: () => {
      const shown = Math.floor(o.t * 1.3 * n);
      let out = '';
      for (let i = 0; i < n; i++) {
        if (text[i] === ' ') { out += ' '; continue; }
        out += i < shown ? text[i] : SCRAMBLE_SET[(i * 31 + ((o.t * 60) | 0)) % SCRAMBLE_SET.length];
      }
      el.textContent = out;
    },
    onComplete: () => { el.textContent = text; },
  });
}

/* estampar: sellos y veredictos */
function stampIn(el, tl, pos) {
  (tl || gsap).fromTo(el, { autoAlpha: 0, scale: 1.8 }, { autoAlpha: 1, scale: 1, duration: .4, ease: 'power4.out' }, pos);
}

/* HUD */
function hudFase(main, sub) {
  const f = document.querySelector('.apphud .fase');
  if (!f) return;
  decodeTo(f.childNodes[0].nodeType === 3 ? f : f, ''); /* noop guard */
  const strong = f.querySelector('b') || f;
  decodeTo(strong, main, .5);
  const small = f.querySelector('small');
  if (small && sub !== undefined) small.textContent = sub;
}
function hudProgress(p, cyan) {
  const bar = document.querySelector('.apphud .progress i');
  if (bar) gsap.to(bar, { scaleX: p, duration: .6, ease: 'power2.out' });
  document.querySelector('.apphud').classList.toggle('fase-cyan', !!cyan);
}

/* telón de salida hacia otra pantalla (§4.2) */
function telonHacia(href) {
  const t = document.querySelector('.telon');
  if (!t || REDUCED) { location.href = href; return; }
  gsap.fromTo(t, { scaleY: 0, transformOrigin: 'bottom' }, {
    scaleY: 1, duration: .55, ease: 'power3.inOut',
    onComplete: () => { location.href = href; },
  });
}

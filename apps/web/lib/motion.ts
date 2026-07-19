/**
 * Verbos canónicos de GUIA-VISUAL §6, porteados de design/app/shared.js.
 * Solo cliente: gsap toca el DOM. Importar únicamente desde componentes 'use client'.
 */
import gsap from 'gsap';

const NS = 'http://www.w3.org/2000/svg';

export function mk(
  tag: string,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElement {
  const el = document.createElementNS(NS, tag) as SVGElement;
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(el);
  return el;
}

/** Prepara un path para dibujarse (dasharray = largo total). */
export function setDraw(p: SVGPathElement | SVGGeometryElement): number {
  const L = p.getTotalLength();
  p.style.strokeDasharray = String(L);
  p.style.strokeDashoffset = String(L);
  return L;
}

export function reduced(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* decode/scramble: SOLO textos mono forenses */
const SCRAMBLE_SET = '01%×#/·▏▶';

export function decodeTo(el: Element, text: string, dur = 0.7): gsap.core.Tween {
  const o = { t: 0 };
  const n = text.length;
  return gsap.to(o, {
    t: 1,
    duration: dur,
    ease: 'none',
    onUpdate: () => {
      const shown = Math.floor(o.t * 1.3 * n);
      let out = '';
      for (let i = 0; i < n; i++) {
        if (text[i] === ' ') {
          out += ' ';
          continue;
        }
        out += i < shown ? text[i] : SCRAMBLE_SET[(i * 31 + ((o.t * 60) | 0)) % SCRAMBLE_SET.length];
      }
      el.textContent = out;
    },
    onComplete: () => {
      el.textContent = text;
    },
  });
}

/* estampar: sellos y veredictos */
export function stampIn(el: Element, tl?: gsap.core.Timeline, pos?: gsap.Position): void {
  if (tl) {
    tl.fromTo(
      el,
      { autoAlpha: 0, scale: 1.8 },
      { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'power4.out' },
      pos,
    );
  } else {
    gsap.fromTo(el, { autoAlpha: 0, scale: 1.8 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'power4.out' });
  }
}

export { gsap };

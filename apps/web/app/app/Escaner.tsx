'use client';

/**
 * EL ESCÁNER · set piece "la mesa de luz" (porteo fiel de design/app/escaner.html).
 * El negativo con las fotos avanza a través de un cabezal fijo de escaneo.
 * Diferencia con el prototipo: acá el playhead del guion NO corre con tiempos
 * simulados; lo maneja el progreso real del polling (leidas/total) vía tweenTo.
 * QA (?qa=1): seek instantáneo al estado, sin tweens a mitad en captures.
 */

import { useEffect, useRef } from 'react';
import { decodeTo, gsap, mk, reduced, setDraw, stampIn } from '../../lib/motion';

const ENT = 1.3; // fin de la entrada de escena
const PORFOTO = 1.75; // ventana de guion por foto

export type EscanerEstado = 'analizando' | 'sintetizando' | 'error';

export function Escaner(props: {
  total: number;
  leidas: number;
  estado: EscanerEstado;
  qa?: boolean;
  onVolver?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const driveRef = useRef<gsap.core.Tween | null>(null);
  const tSalRef = useRef(0);
  const builtRef = useRef(false);
  const errShown = useRef(false);
  const N = Math.min(9, Math.max(4, props.total || 6));

  /* ---------- construcción de la escena (una vez) ---------- */
  useEffect(() => {
    const el = root.current;
    if (!el || builtRef.current) return;
    builtRef.current = true;

    const ctx = gsap.context(() => {
      const q = (sel: string) => el.querySelector(sel) as HTMLElement;
      const INSTANT = !!props.qa;
      const decode = (node: Element, txt: string) => {
        if (INSTANT) node.textContent = txt;
        else decodeTo(node, txt);
      };
      const hudProgress = (p: number, cyan: boolean) => {
        const bar = q('.apphud .progress i');
        if (bar) gsap.to(bar, { scaleX: p, duration: 0.6, ease: 'power2.out' });
        q('.apphud')?.classList.toggle('fase-cyan', cyan);
      };

      /* ----- fotogramas del negativo (5 capas §5.1) ----- */
      const SILUETAS: Array<(g: SVGElement) => void> = [
        (g) => {
          mk('circle', { cx: 150, cy: 84, r: 30, fill: '#232C37' }, g);
          mk('path', { d: 'M96 172 C112 128 188 128 204 172 L204 186 L96 186 Z', fill: '#232C37' }, g);
        },
        (g) => {
          mk('line', { x1: 34, y1: 138, x2: 266, y2: 138, stroke: '#242D38', 'stroke-width': 2 }, g);
          mk('circle', { cx: 118, cy: 74, r: 16, fill: '#232C37' }, g);
          mk('path', { d: 'M104 170 C108 120 128 120 132 170 Z', fill: '#232C37' }, g);
          mk('path', { d: 'M236 138 L252 108 L268 138 Z', fill: '#1F2833' }, g);
        },
        (g) => {
          mk('circle', { cx: 120, cy: 84, r: 24, fill: '#232C37' }, g);
          mk('circle', { cx: 186, cy: 92, r: 20, fill: '#202934' }, g);
          mk('path', { d: 'M84 178 C100 136 148 136 158 178 Z', fill: '#232C37' }, g);
          mk('path', { d: 'M158 180 C166 148 208 148 220 180 Z', fill: '#202934' }, g);
        },
        (g) => {
          mk('circle', { cx: 158, cy: 104, r: 44, fill: '#232C37' }, g);
          mk('path', { d: 'M70 186 C96 132 226 132 244 186 Z', fill: '#232C37' }, g);
          mk('path', { d: 'M62 52 A30 30 0 0 1 92 34', fill: 'none', stroke: '#39485A', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.7 }, g);
        },
        (g) => {
          mk('circle', { cx: 104, cy: 78, r: 15, fill: '#232C37' }, g);
          mk('path', { d: 'M92 168 C96 118 116 118 122 168 Z', fill: '#232C37' }, g);
          mk('circle', { cx: 208, cy: 130, r: 34, fill: 'none', stroke: '#2A3540', 'stroke-width': 5 }, g);
          mk('circle', { cx: 208, cy: 130, r: 5, fill: '#2A3540' }, g);
        },
      ];

      function buildFrame(i: number): HTMLDivElement {
        const wrap = document.createElement('div');
        wrap.className = 'frame';
        const svg = mk('svg', { viewBox: '0 0 300 210' });
        wrap.appendChild(svg);
        /* capa material: cartón del negativo + perforaciones de película */
        mk('rect', { x: 0, y: 0, width: 300, height: 210, rx: 8, fill: '#151A22', stroke: '#262C36', 'stroke-width': 1.5 }, svg);
        for (let k = 0; k < 4; k++) {
          mk('rect', { x: 7, y: 18 + k * 48, width: 11, height: 17, rx: 3, fill: '#0D1117', stroke: '#242D38', 'stroke-width': 1.2 }, svg);
          mk('rect', { x: 282, y: 18 + k * 48, width: 11, height: 17, rx: 3, fill: '#0D1117', stroke: '#242D38', 'stroke-width': 1.2 }, svg);
        }
        mk('rect', { x: 26, y: 12, width: 248, height: 186, rx: 4, fill: '#1A212B' }, svg);
        const sil = mk('g', { opacity: 0.95 }, svg);
        SILUETAS[i % SILUETAS.length]!(sil);
        /* carácter: rayas de desgaste + esquineros */
        mk('line', { x1: 60 + (i * 37) % 120, y1: 22, x2: 74 + (i * 37) % 120, y2: 190, stroke: '#222B35', 'stroke-width': 1 }, svg);
        const eq = mk('g', { stroke: '#4A5666', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }, svg);
        ([[30, 26, 1, 1], [270, 26, -1, 1], [30, 184, 1, -1], [270, 184, -1, -1]] as const).forEach(([x, y, sx, sy]) => {
          mk('path', { d: `M${x} ${y + 10 * sy} L${x} ${y} L${x + 10 * sx} ${y}` }, eq);
        });
        /* información: etiqueta FOTO 0N */
        const tag = mk('g', {}, svg);
        mk('rect', { x: 32, y: 168, width: 66, height: 22, rx: 3, fill: 'rgba(16,19,24,.85)', stroke: '#262C36', 'stroke-width': 1 }, tag);
        mk('text', { x: 65, y: 183, 'text-anchor': 'middle', 'font-family': 'var(--font-mono),monospace', 'font-size': 11, 'letter-spacing': 2, fill: '#8C96A3' }, tag).textContent = `FOTO 0${i + 1}`;
        /* capa de análisis (se revela con el haz) */
        const an = mk('g', { class: 'analysis', opacity: 0 }, svg);
        for (let gx = 56; gx <= 244; gx += 31) mk('line', { x1: gx, y1: 16, x2: gx, y2: 194, stroke: 'rgba(79,217,194,.14)', 'stroke-width': 1 }, an);
        for (let gy = 40; gy <= 180; gy += 28) mk('line', { x1: 28, y1: gy, x2: 272, y2: gy, stroke: 'rgba(79,217,194,.12)', 'stroke-width': 1 }, an);
        const cross = mk('g', { class: 'cross' }, an);
        const cy0 = i % SILUETAS.length === 3 ? 104 : 84;
        mk('circle', { cx: 150, cy: cy0, r: 24, fill: 'none', stroke: '#4FD9C2', 'stroke-width': 1.6 }, cross);
        mk('line', { x1: 150, y1: cy0 - 32, x2: 150, y2: cy0 - 16, stroke: '#4FD9C2', 'stroke-width': 1.4 }, cross);
        mk('line', { x1: 150, y1: cy0 + 16, x2: 150, y2: cy0 + 32, stroke: '#4FD9C2', 'stroke-width': 1.4 }, cross);
        mk('line', { x1: 118, y1: cy0, x2: 134, y2: cy0, stroke: '#4FD9C2', 'stroke-width': 1.4 }, cross);
        mk('line', { x1: 166, y1: cy0, x2: 182, y2: cy0, stroke: '#4FD9C2', 'stroke-width': 1.4 }, cross);
        const co1 = mk('g', { class: 'co' }, an);
        mk('line', { x1: 174, y1: cy0 - 10, x2: 216, y2: cy0 - 26, stroke: '#4FD9C2', 'stroke-width': 1.2 }, co1);
        mk('text', { x: 219, y: cy0 - 22, 'font-family': 'var(--font-mono),monospace', 'font-size': 11, fill: '#E6E9ED' }, co1).textContent = `LUZ ${38 + (i * 17) % 50}`;
        const co2 = mk('g', { class: 'co' }, an);
        mk('line', { x1: 126, y1: cy0 + 14, x2: 84, y2: cy0 + 40, stroke: '#4FD9C2', 'stroke-width': 1.2 }, co2);
        mk('text', { x: 40, y: cy0 + 54, 'font-family': 'var(--font-mono),monospace', 'font-size': 11, fill: '#E6E9ED' }, co2).textContent = `FONDO ${22 + (i * 29) % 55}`;
        /* sello LEÍDA con tilde dibujada */
        const sello = mk('g', { class: 'leida', opacity: 0, transform: 'rotate(-4 236 30)' }, svg);
        mk('rect', { x: 200, y: 17, width: 72, height: 26, rx: 3, fill: 'rgba(16,19,24,.72)', stroke: '#4FD9C2', 'stroke-width': 1.6 }, sello);
        mk('text', { x: 228, y: 34, 'text-anchor': 'middle', 'font-family': 'var(--font-mono),monospace', 'font-size': 11, 'letter-spacing': 2, fill: '#4FD9C2' }, sello).textContent = 'LEÍDA';
        mk('path', { class: 'tilde', d: 'M255 30 L260 35 L268 23', fill: 'none', stroke: '#4FD9C2', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, sello);
        return wrap;
      }

      /* ----- montar la mesa ----- */
      /* los nodos imperativos NO los limpia ctx.revert(): vaciar antes de armar
         (StrictMode en dev monta dos veces y duplicaría frames/riel/anillo) */
      const strip = q('.strip');
      strip.innerHTML = '';
      for (let i = 0; i < N; i++) strip.appendChild(buildFrame(i));
      const frames = [...strip.children] as HTMLElement[];

      /* riel con dientes */
      const rail = q('.rail') as unknown as SVGSVGElement;
      rail.innerHTML = '';
      const mesaEl = q('.mesa');
      const railH = mesaEl.offsetHeight + 12;
      rail.setAttribute('viewBox', `0 0 10 ${railH}`);
      mk('line', { x1: 5, y1: 0, x2: 5, y2: railH, stroke: '#262C36', 'stroke-width': 3 }, rail);
      for (let y = 6; y < railH; y += 12) mk('line', { x1: 1.5, y1: y, x2: 8.5, y2: y, stroke: '#1C232C', 'stroke-width': 2 }, rail);

      /* loops de vida del instrumento (independientes del guion) */
      if (!reduced()) {
        gsap.to(q('#led'), { opacity: 0.25, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
        gsap.to(q('#pupila'), { scale: 0.82, transformOrigin: 'center', duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
        gsap.to(q('#cabCable'), { rotation: 2.5, transformOrigin: '30px 100px', duration: 2.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
        gsap.to(q('#iris'), { rotation: 8, transformOrigin: '58px 76px', duration: 3.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }

      const frameH = () => frames[0]!.offsetHeight + 14;
      const centerYFor = (i: number) => -(i * frameH()) + (mesaEl.offsetHeight - frames[0]!.offsetHeight) / 2;

      /* la salida muta el h1/eta: restaurar el texto inicial en cada build */
      q('.head h1').innerHTML = 'Leyendo tu perfil como<br/>lo lee el algoritmo.';
      q('.eta').textContent = 'Esto toma entre 25 y 60 segundos. Vale cada uno.';

      const faseTxt = q('#faseTxt');
      const faseSub = q('#faseSub');
      const statusTxt = q('#statusTxt');
      const statusSub = q('#statusSub');

      /* ----- anillo de síntesis ----- */
      const ringG = q('#synRing') as unknown as SVGGElement;
      ringG.innerHTML = '';
      const SEGS = 36;
      for (let s = 0; s < SEGS; s++) {
        const a0 = (s / SEGS) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((s + 0.62) / SEGS) * Math.PI * 2 - Math.PI / 2;
        const r = 128, cx = 160, cy = 160;
        mk('path', {
          d: `M${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`,
          stroke: s % 9 < 3 ? '#4FD9C2' : '#262C36',
          'stroke-width': s % 9 < 3 ? 5 : 3,
          fill: 'none', 'stroke-linecap': 'round',
        }, ringG);
      }
      for (let s = 0; s < 12; s++) {
        const a = (s / 12) * Math.PI * 2;
        mk('line', {
          x1: 160 + 142 * Math.cos(a), y1: 160 + 142 * Math.sin(a),
          x2: 160 + 150 * Math.cos(a), y2: 160 + 150 * Math.sin(a),
          stroke: '#3A4350', 'stroke-width': 2,
        }, ringG);
      }
      const stackG = q('#synStack') as unknown as SVGGElement;
      stackG.innerHTML = '';
      [-7, 0, 7].forEach((rot, k) => {
        mk('rect', { x: 120, y: 208, width: 80, height: 54, rx: 4, fill: '#151A22', stroke: '#262C36', 'stroke-width': 1.4, transform: `rotate(${rot} 160 235)`, opacity: 0.85 - k * 0.18 }, stackG);
      });
      mk('text', { x: 160, y: 296, 'text-anchor': 'middle', 'font-family': 'var(--font-mono),monospace', 'font-size': 11, 'letter-spacing': 3, fill: '#8C96A3' }, stackG).textContent = `${N} PRUEBAS EN CUSTODIA`;

      /* ----- el guion (master timeline, SIEMPRE pausada: la maneja el polling) ----- */
      const tl = gsap.timeline({ paused: true });
      tlRef.current = tl;

      /* entrada de escena: bastidores (§4.1) */
      gsap.set(frames, { x: -90, rotation: -3, autoAlpha: 0 });
      gsap.set(q('.cabezal'), { x: 90, autoAlpha: 0 });
      gsap.set(rail, { autoAlpha: 0 });
      gsap.set([q('.head'), q('.status')], { autoAlpha: 0, y: 24 });
      tl.to(q('.head'), { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 0)
        .to(frames, { x: 0, rotation: 0, autoAlpha: 1, duration: 0.55, stagger: 0.07, ease: 'power2.out' }, 0.15)
        .to(rail, { autoAlpha: 1, duration: 0.4 }, 0.5)
        .to(q('.cabezal'), { x: 0, autoAlpha: 1, duration: 0.7, ease: 'back.out(1.4)' }, 0.55)
        .to(q('.status'), { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.7)
        .call(() => { decode(faseTxt, 'ANALIZANDO EVIDENCIA'); decode(statusTxt, 'EL CABEZAL ESTÁ CALIENTE'); }, undefined, 0.9);

      /* cada foto pasa por el cabezal */
      frames.forEach((f, i) => {
        const at = ENT + i * PORFOTO;
        tl.to(strip, { y: centerYFor(i), duration: 0.6, ease: 'power2.inOut' }, at)
          .to(q('.beam'), { opacity: 1, duration: 0.18 }, at + 0.5)
          .to(f.querySelector('.analysis'), { opacity: 1, duration: 0.3 }, at + 0.55)
          .from(f.querySelector('.cross'), { scale: 0.3, autoAlpha: 0, transformOrigin: 'center', duration: 0.4, ease: 'back.out(2.2)' }, at + 0.6)
          .from(f.querySelectorAll('.co'), { autoAlpha: 0, x: -14, duration: 0.35, stagger: 0.16, ease: 'power2.out' }, at + 0.75)
          .call(() => {
            faseSub.textContent = `foto ${i + 1} de ${N}`;
            hudProgress(((i + 1) / N) * 0.68, false);
          }, undefined, at + 0.8)
          .to(q('.beam'), { opacity: 0, duration: 0.25 }, at + 1.35);
        const sello = f.querySelector('.leida')!;
        stampIn(sello, tl, at + 1.4);
        const tilde = f.querySelector('.tilde') as SVGPathElement;
        tl.call(() => setDraw(tilde), undefined, at + 1.4)
          .to(tilde, { strokeDashoffset: 0, duration: 0.25, ease: 'power2.inOut' }, at + 1.5);
      });

      /* salida coreografiada (§4.2) + fase síntesis */
      const tSal = ENT + N * PORFOTO + 0.3;
      tSalRef.current = tSal;
      const h1 = q('.head h1');
      const eta = q('.eta');
      tl.call(() => {
        decode(faseTxt, 'SINTETIZANDO VEREDICTO');
        faseSub.textContent = 'cruzando señales';
        hudProgress(0.86, true);
        decode(statusTxt, 'CRUZANDO SEÑALES CONTRA 294M DE SWIPES');
        statusSub.textContent = '10 a 30 segundos · no cierres la pantalla';
      }, undefined, tSal)
        .set(q('.beam'), { opacity: 0 }, tSal)
        .to(frames, { x: -110, rotation: -4, autoAlpha: 0, duration: 0.5, stagger: 0.05, ease: 'power2.in' }, tSal)
        .to([q('.cabezal'), rail], { x: 90, autoAlpha: 0, duration: 0.5, ease: 'power2.in' }, tSal + 0.15)
        .to(h1, { autoAlpha: 0, y: -18, duration: 0.4, ease: 'power2.in' }, tSal + 0.1)
        .call(() => {
          h1.innerHTML = 'Cruzando tus señales<br/>contra el mercado.';
          eta.textContent = 'La IA está armando tu veredicto. Diez a treinta segundos.';
        }, undefined, tSal + 0.55)
        .to(h1, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, tSal + 0.6)
        .set(q('.sintesis'), { visibility: 'visible' }, tSal + 0.55)
        .fromTo(q('.sintesis'), { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: 0.7, ease: 'power2.out' }, tSal + 0.6)
        .from((stackG as unknown as Element).querySelectorAll('rect'), { y: 40, autoAlpha: 0, stagger: 0.1, duration: 0.5, ease: 'power2.out' }, tSal + 0.8);
      const seams = el.querySelectorAll('#synHeart .hs') as NodeListOf<SVGPathElement>;
      tl.call(() => seams.forEach((s) => setDraw(s)), undefined, tSal + 0.9);
      seams.forEach((s, k) => tl.to(s, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.inOut' }, tSal + 1 + k * 0.18));
      /* padding final: el anillo queda girando mientras la API sintetiza */
      tl.to({}, { duration: 0.1 }, tSal + 2.2);

      if (!reduced()) {
        gsap.to(q('#synRing'), { rotation: 360, transformOrigin: '160px 160px', duration: 9, ease: 'none', repeat: -1 });
        gsap.to(q('#synHeart'), { scale: 0.335, transformOrigin: '160px 160px', duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }
    }, el);

    return () => {
      ctx.revert();
      tlRef.current = null;
      builtRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- el polling maneja el playhead ---------- */
  useEffect(() => {
    const tl = tlRef.current;
    const el = root.current;
    if (!tl || !el) return;
    const tSal = tSalRef.current;
    const T_SYNTH = tSal + 2.2;

    /* labels determinísticos por fase (los seek de QA no disparan las calls) */
    const labelsAt = (t: number) => {
      const faseTxt = el.querySelector('#faseTxt')!;
      const faseSub = el.querySelector('#faseSub')!;
      const statusTxt = el.querySelector('#statusTxt')!;
      const statusSub = el.querySelector('#statusSub')!;
      const bar = el.querySelector('.apphud .progress i');
      const hud = el.querySelector('.apphud');
      if (t >= tSal) {
        faseTxt.textContent = 'SINTETIZANDO VEREDICTO';
        faseSub.textContent = 'cruzando señales';
        statusTxt.textContent = 'CRUZANDO SEÑALES CONTRA 294M DE SWIPES';
        statusSub.textContent = '10 a 30 segundos · no cierres la pantalla';
        const h1 = el.querySelector('.head h1')!;
        h1.innerHTML = 'Cruzando tus señales<br/>contra el mercado.';
        el.querySelector('.eta')!.textContent = 'La IA está armando tu veredicto. Diez a treinta segundos.';
        if (bar) gsap.set(bar, { scaleX: 0.86 });
        hud?.classList.add('fase-cyan');
      } else if (t >= ENT) {
        const i = Math.min(N - 1, Math.floor((t - ENT) / PORFOTO));
        faseTxt.textContent = 'ANALIZANDO EVIDENCIA';
        faseSub.textContent = `foto ${i + 1} de ${N}`;
        statusTxt.textContent = 'EL CABEZAL ESTÁ CALIENTE';
        if (bar) gsap.set(bar, { scaleX: ((i + 1) / N) * 0.68 });
        hud?.classList.remove('fase-cyan');
      }
    };

    if (props.estado === 'error') {
      driveRef.current?.kill();
      const tErr = ENT + Math.min(props.leidas, N - 1) * PORFOTO + 0.9;
      tl.pause(Math.min(tl.time() || tErr, tSal - 0.05) || tErr);
      const core = el.querySelector('.beam .core') as HTMLElement;
      const band = el.querySelector('.beam .glowband') as HTMLElement;
      core.style.background = 'var(--oxide)';
      core.style.boxShadow = '0 0 14px rgba(201,75,50,.9)';
      band.style.background = 'linear-gradient(180deg,transparent, rgba(201,75,50,.2) 46%, rgba(201,75,50,.2) 54%, transparent)';
      (el.querySelector('.beam') as HTMLElement).style.opacity = '1';
      el.querySelector('#faseTxt')!.textContent = 'LECTURA INTERRUMPIDA';
      el.querySelector('#faseSub')!.textContent = 'cupo intacto';
      const bar = el.querySelector('.apphud .progress i');
      if (bar) gsap.set(bar, { scaleX: 0.4 });
      const mesa = el.querySelector('.mesa');
      const errbox = el.querySelector('.errbox');
      if (errShown.current || props.qa) {
        gsap.set(mesa, { autoAlpha: 0.28, filter: 'saturate(.4)' });
        gsap.set([el.querySelector('.head'), el.querySelector('.status')], { autoAlpha: 0 });
        gsap.set(errbox, { visibility: 'visible', autoAlpha: 1, y: 0 });
      } else {
        errShown.current = true;
        gsap.to(mesa, { x: 6, duration: 0.06, yoyo: true, repeat: 5 });
        gsap.to(mesa, { autoAlpha: 0.28, filter: 'saturate(.4)', duration: 0.5, delay: 0.4 });
        gsap.to([el.querySelector('.head'), el.querySelector('.status')], { autoAlpha: 0, y: -14, duration: 0.4, delay: 0.3 });
        gsap.set(errbox, { visibility: 'visible' });
        gsap.fromTo(errbox, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 0.6, delay: 0.6, ease: 'power2.out' });
        const sello = el.querySelector('.errbox .selloe');
        gsap.fromTo(sello, { scale: 1.8, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.4, delay: 0.75, ease: 'power4.out' });
      }
      return;
    }

    /* target del playhead según el estado REAL:
       - leyendo foto k (0-based = leidas): mitad de su ventana de escaneo
       - todas leídas → síntesis completa (el loop del anillo sigue solo) */
    const target =
      props.estado === 'sintetizando' || props.leidas >= N
        ? T_SYNTH
        : ENT + Math.min(props.leidas, N - 1) * PORFOTO + 0.9;

    driveRef.current?.kill();
    if (props.qa) {
      tl.seek(target).pause();
      labelsAt(target);
    } else if (target > tl.time()) {
      driveRef.current = tl.tweenTo(target);
    }
  }, [props.estado, props.leidas, props.qa, N]);

  return (
    <div ref={root} className="dmx-escaner">
      <div className="apphud">
        <span className="chip">Datemaxxer · Expediente 001</span>
        <div className="fase"><b id="faseTxt">PREPARANDO MESA DE LUZ</b><small id="faseSub">evidencia recibida</small></div>
        <div className="progress"><i /></div>
      </div>

      <header className="head">
        <p className="kicker"><i />Tu evidencia está en la mesa</p>
        <h1 className="display">Leyendo tu perfil como<br />lo lee el algoritmo.</h1>
        <p className="eta">Esto toma entre 25 y 60 segundos. Vale cada uno.</p>
      </header>

      <div className="mesa">
        <div className="ventana"><div className="strip" /></div>
        <svg className="rail" preserveAspectRatio="none" />
        <div className="beam"><div className="glowband" /><div className="core" /></div>
        <div className="cabezal">
          <svg viewBox="0 0 150 150">
            <defs>
              <linearGradient id="cabG" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#232B36" /><stop offset="1" stopColor="#141922" />
              </linearGradient>
            </defs>
            {/* brazo al riel: placa + tornillos con ranura */}
            <g id="cabArm">
              <rect x="96" y="62" width="46" height="26" rx="5" fill="#1B222C" stroke="#262C36" strokeWidth="1.5" />
              <circle cx="106" cy="75" r="4.4" fill="#0F141A" stroke="#3A4350" strokeWidth="1.4" />
              <line x1="103" y1="75" x2="109" y2="75" stroke="#5B6672" strokeWidth="1.4" />
              <circle cx="132" cy="75" r="4.4" fill="#0F141A" stroke="#3A4350" strokeWidth="1.4" />
              <line x1="129" y1="72" x2="135" y2="78" stroke="#5B6672" strokeWidth="1.4" />
            </g>
            {/* cuerpo facetado del cabezal */}
            <g id="cabBody">
              <path d="M18 52 L64 40 L100 52 L104 96 L64 112 L22 98 Z" fill="url(#cabG)" stroke="#2E3742" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M64 40 L100 52 L104 96" fill="none" stroke="#3A4350" strokeWidth="1.2" />
              <path d="M24 56 L60 46" fill="none" stroke="#465361" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="30" cy="92" r="3.4" fill="#0F141A" stroke="#3A4350" strokeWidth="1.2" />
              <line x1="28" y1="90" x2="32" y2="94" stroke="#5B6672" strokeWidth="1.1" />
              <g stroke="#2A323D" strokeWidth="2" strokeLinecap="round">
                <line x1="78" y1="98" x2="92" y2="93" /><line x1="78" y1="104" x2="92" y2="99" />
              </g>
            </g>
            {/* lente: aro, iris de 6 láminas, vidrio y LED */}
            <g id="cabLens">
              <circle cx="58" cy="76" r="24" fill="#0D1218" stroke="#3A4350" strokeWidth="2.4" />
              <circle cx="58" cy="76" r="17" fill="none" stroke="#2A323D" strokeWidth="1.4" />
              <g id="iris" stroke="#374253" strokeWidth="1.6">
                <line x1="58" y1="60" x2="63" y2="70" /><line x1="72" y1="68" x2="62" y2="73" />
                <line x1="72" y1="85" x2="63" y2="80" /><line x1="58" y1="92" x2="61" y2="82" />
                <line x1="44" y1="85" x2="53" y2="80" /><line x1="44" y1="68" x2="54" y2="72" />
              </g>
              <circle id="pupila" cx="58" cy="76" r="7.5" fill="#4FD9C2" opacity=".9" />
              <path d="M46 64 A17 17 0 0 1 63 60" fill="none" stroke="#7A8797" strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
              <circle id="led" cx="92" cy="58" r="3.2" fill="#4FD9C2" />
            </g>
            {/* cable con comba y enchufe */}
            <g id="cabCable">
              <path d="M30 100 C18 118 30 132 14 138" fill="none" stroke="#2E3742" strokeWidth="3.4" strokeLinecap="round" />
              <rect x="8" y="136" width="12" height="7" rx="2" fill="#1B222C" stroke="#3A4350" strokeWidth="1.2" />
            </g>
          </svg>
        </div>
        <div className="sintesis">
          <svg viewBox="0 0 320 320">
            <g id="synRing" />
            <g id="synHeart" fill="none" strokeLinejoin="round" strokeLinecap="round" transform="translate(96 92) scale(.32)">
              <path className="hh" d="M200,95 L150,40 L95,35 L50,75 L35,135 L55,200 L200,355 L345,200 L365,135 L350,75 L305,35 L250,40 Z" stroke="#333C47" strokeWidth="8" />
              <path className="hh hs" d="M200,95 L204,192 L196,278 L200,355" stroke="#4FD9C2" strokeWidth="7" />
              <path className="hh hs" d="M35,135 L120,200 L196,278" stroke="#4FD9C2" strokeWidth="7" />
              <path className="hh hs" d="M365,135 L280,200 L196,278" stroke="#4FD9C2" strokeWidth="7" />
            </g>
            <g id="synStack" />
          </svg>
        </div>
      </div>

      <div className="status">
        <div className="mono" id="statusTxt">EVIDENCIA EN COLA</div>
        <div className="sub" id="statusSub">no cierres esta pantalla</div>
      </div>

      <div className="errbox">
        <span className="selloe">Error de lectura</span>
        <p>Algo se cortó a mitad del análisis. Tu cupo gratuito sigue intacto: los errores no lo queman.</p>
        <button className="btn" onClick={props.onVolver}>Volver a la mesa e intentar de nuevo</button>
      </div>
    </div>
  );
}

'use client';

/**
 * EL INFORME · set piece "el estampado del veredicto" (porteo fiel de
 * design/app/informe.html). Secuencia causal: la aguja barre y se clava →
 * sello de zona → sello del arquetipo con glifo dibujado → la lectura se
 * subraya en óxido → lo pago entra ya cosido con sutura → CTA del Kit.
 * Datos REALES del motor via props (nada hardcodeado).
 */

import { useEffect, useRef, useState } from 'react';
import { GLIFOS } from '../../lib/glifos';
import { ApiError, pedirPlan } from '../../lib/api';
import { getAccessToken } from '../../lib/supabase';
import { gsap, mk, setDraw } from '../../lib/motion';

const NOMBRES: Record<string, string> = {
  viajero: 'Viajero',
  intelectual: 'Intelectual',
  deportista: 'Deportista',
  creativo: 'Creativo',
  profesional: 'Profesional',
  outdoor: 'Outdoor',
  social: 'Social',
  hogareno: 'Hogareño',
};

export function Informe(props: {
  score: number;
  arquetipo: string;
  confianza: number; // 0-100
  lectura: string;
  nFotos: number;
  qa?: boolean;
  onRehacer?: (() => void) | undefined;
}) {
  const root = useRef<HTMLDivElement>(null);
  const built = useRef(false);
  const [pedido, setPedido] = useState<'no' | 'enviando' | 'listo'>('no');
  const [errorPedido, setErrorPedido] = useState<string | null>(null);
  const { score, confianza, nFotos } = props;
  const nombre = NOMBRES[props.arquetipo] ?? props.arquetipo;

  /**
   * Todavía no hay checkout: el pedido queda registrado, le avisa a Fernando por
   * mail y el cobro se cierra a mano con un link de pago. Es a propósito - se
   * valida que alguien quiera pagar antes de montar la pasarela.
   */
  async function pedirKit() {
    setPedido('enviando');
    setErrorPedido(null);
    const token = await getAccessToken();
    if (!token) {
      setErrorPedido('Tu sesión se interrumpió. Recargá la página.');
      setPedido('no');
      return;
    }
    try {
      await pedirPlan(token, 'kit');
      setPedido('listo');
    } catch (err) {
      setErrorPedido(err instanceof ApiError ? err.message : 'No pudimos registrar tu pedido.');
      setPedido('no');
    }
  }

  useEffect(() => {
    const el = root.current;
    if (!el || built.current) return;
    built.current = true;

    const ctx = gsap.context(() => {
      const q = (sel: string) => el.querySelector(sel) as HTMLElement;
      const QA = !!props.qa;

      /* ---------- medidor: zonas, ticks, números ---------- */
      const CX = 180, CYg = 178, R = 128;
      const pt = (deg: number, r: number): [number, number] => {
        const a = Math.PI - (deg / 100) * Math.PI;
        return [CX + r * Math.cos(a), CYg - r * Math.sin(a)];
      };
      const zonas: Array<[number, number, string]> = [[0, 40, '#C94B32'], [40, 70, '#E8B04B'], [70, 100, '#4FD9C2']];
      /* los nodos imperativos NO los limpia ctx.revert(): vaciar antes de armar */
      const gz = q('#gzones') as unknown as SVGGElement;
      gz.innerHTML = '';
      zonas.forEach(([a, b, col]) => {
        const [x0, y0] = pt(a + 1.2, R), [x1, y1] = pt(b - 1.2, R);
        mk('path', { d: `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}`, stroke: col, 'stroke-width': 7, opacity: 0.85 }, gz);
      });
      const gt = q('#gticks') as unknown as SVGGElement;
      gt.innerHTML = '';
      for (let v = 0; v <= 100; v += 5) {
        const major = v % 25 === 0;
        const [x0, y0] = pt(v, R - 12), [x1, y1] = pt(v, R - (major ? 26 : 19));
        mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: major ? '#5B6672' : '#333C47', 'stroke-width': major ? 2.2 : 1.3 }, gt);
      }
      const gn = q('#gnums') as unknown as SVGGElement;
      gn.innerHTML = '';
      [0, 25, 50, 75, 100].forEach((v) => {
        const [x, y] = pt(v, R - 40);
        mk('text', { x, y: y + 4, 'text-anchor': 'middle' }, gn).textContent = String(v);
      });
      /* área de riesgo hatchada bajo la zona donde cayó el score */
      const zona = score < 40 ? 0 : score < 70 ? 1 : 2;
      const [za, zb] = [zonas[zona]![0], zonas[zona]![1]];
      const [rx0, ry0] = pt(za, R - 6), [rx1, ry1] = pt(zb, R - 6);
      q('#garcRisk').setAttribute('d', `M${CX} ${CYg} L${rx0} ${ry0} A${R - 6} ${R - 6} 0 0 1 ${rx1} ${ry1} Z`);
      const zonaTxt = zona === 0 ? 'Zona de riesgo' : zona === 1 ? 'Zona de advertencia' : 'Zona legible';
      q('#zonaSello').textContent = zonaTxt;
      if (zona === 2) q('#zonaSello').classList.add('s-cy');

      const needleDeg = (v: number) => -90 + (v / 100) * 180;
      /* svgOrigin, no transformOrigin: el pivote debe ser el centro del arco en coords SVG */
      gsap.set(q('#gneedle'), { rotation: needleDeg(0), svgOrigin: '180 178' });

      /* ---------- suturas de las fichas selladas ---------- */
      const stitchesBySec = new Map<Element, SVGPathElement[]>();
      el.querySelectorAll('.sellado').forEach((sec) => {
        const svg = sec.querySelector('.sutura')!;
        svg.innerHTML = '';
        const w = (sec as HTMLElement).offsetWidth, h = (sec as HTMLElement).offsetHeight;
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        const g = mk('g', { fill: 'none', stroke: '#4FD9C2', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0.55 }, svg);
        const st: SVGPathElement[] = [];
        const paso = Math.max(96, (w - 60) / 4), cruz = 46;
        for (let x = 30; x < w - cruz - 12; x += paso) {
          st.push(mk('path', { d: `M${x} 10 L${x + cruz} ${h - 10}` }, g) as SVGPathElement);
          st.push(mk('path', { d: `M${x + cruz} 10 L${x} ${h - 10}` }, g) as SVGPathElement);
          mk('circle', { cx: x, cy: 10, r: 3, fill: '#101318', stroke: '#4FD9C2', 'stroke-width': 1.5 }, g);
          mk('circle', { cx: x + cruz, cy: h - 10, r: 3, fill: '#101318', stroke: '#4FD9C2', 'stroke-width': 1.5 }, g);
        }
        stitchesBySec.set(sec, st);
      });

      /* ---------- la secuencia causal del veredicto ---------- */
      const hud = q('.apphud');
      hud.classList.add('fase-cyan');
      gsap.to(q('.apphud .progress i'), { scaleX: 1, duration: 0.6, ease: 'power2.out' });

      const tl = gsap.timeline({ paused: QA });
      const paneles = ['.doc-head', '.medidor', '#pArq', '#pLectura', '#s1', '#s2', '#s3', '.unlock'].map((s) => q(s));
      gsap.set(paneles, { autoAlpha: 0, y: 30 });
      tl.to(q('.doc-head'), { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 0)
        .to(q('.medidor'), { autoAlpha: 1, y: 0, duration: 0.65, ease: 'power2.out' }, 0.25);

      /* 1: la aguja barre con física y se clava en el score */
      tl.to(q('#gneedle'), { rotation: needleDeg(score), svgOrigin: '180 178', duration: 1.7, ease: 'elastic.out(1, .48)' }, 0.8);
      const so = { v: 0 };
      tl.to(so, { v: score, duration: 1.2, ease: 'power2.out', onUpdate: () => { q('#scoreNum').textContent = String(Math.round(so.v)); } }, 0.8)
        .to(q('#garcRisk'), { opacity: 0.5, duration: 0.5 }, 1.5);
      /* 2: el clavarse dispara el sello de zona y el arquetipo */
      tl.fromTo(q('#zonaSello'), { scale: 1.8, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.38, ease: 'power4.out' }, 2.1)
        .to(q('#pArq'), { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 2.3)
        .fromTo(q('#arqSeal'), { scale: 1.9, autoAlpha: 0, transformOrigin: 'center' }, { scale: 1, autoAlpha: 1, duration: 0.45, ease: 'power4.out' }, 2.55);
      /* glifo del arquetipo detectado: 48x48 centrado en el sello 120x120 */
      const glyphG = q('#arqGlyph') as unknown as SVGGElement;
      glyphG.innerHTML = '';
      (GLIFOS[props.arquetipo] ?? GLIFOS.viajero!)(glyphG);
      const glyph = glyphG.querySelectorAll('path, circle') as NodeListOf<SVGGeometryElement>;
      tl.call(() => glyph.forEach((p) => setDraw(p)), undefined, 2.6);
      glyph.forEach((p, i) => tl.to(p, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.inOut' }, 2.7 + i * 0.12));
      const co = { v: 0 };
      tl.to(co, { v: confianza, duration: 0.9, ease: 'power2.out', onUpdate: () => { q('#confNum').textContent = String(Math.round(co.v)); } }, 2.8)
        .to(q('#confBar'), { width: confianza + '%', duration: 0.9, ease: 'power3.out' }, 2.8);
      /* 3: la lectura se escribe y se subraya en óxido */
      tl.to(q('#pLectura'), { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 3.4)
        .to(q('#lecturaTxt'), { '--w': 100, duration: 0.9, ease: 'power2.inOut' }, 3.8);
      /* 4: lo pago entra ya cosido; las puntadas se tensan una a una */
      ['#s1', '#s2', '#s3'].forEach((id, k) => {
        const at = 4.1 + k * 0.35;
        tl.to(q(id), { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, at);
        const st = stitchesBySec.get(q(id))!;
        tl.call(() => st.forEach((s) => setDraw(s)), undefined, at + 0.05);
        tl.to(st, { strokeDashoffset: 0, duration: 0.5, stagger: 0.03, ease: 'power2.inOut' }, at + 0.15);
      });
      tl.to(q('.unlock'), { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power2.out' }, 5.4);

      if (QA) {
        tl.progress(1);
        q('#scoreNum').textContent = String(score);
        q('#confNum').textContent = String(Math.round(confianza));
      } else {
        tl.play(0);
      }
    }, el);

    return () => {
      ctx.revert();
      built.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={root} className="dmx-informe">
      <div className="apphud">
        <span className="chip">Datemaxxer · Expediente 001</span>
        <div className="fase"><b>VEREDICTO LISTO</b><small>informe completo</small></div>
        <div className="progress"><i /></div>
      </div>

      <main className="doc">
        <header className="doc-head">
          <p className="kicker"><i />Tu expediente está completo</p>
          <h1 className="display">El veredicto<br />de tu perfil.</h1>
          <div className="caso"><span className="selloe s-cy">EXPEDIENTE · {nFotos} FOTOS + BIO</span></div>
        </header>

        {/* 1 · el medidor */}
        <section className="panel medidor">
          <div className="plabel">Score de coherencia · cómo te lee el algoritmo</div>
          <svg viewBox="0 0 360 210">
            <defs>
              <pattern id="ghatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="7" stroke="#C94B32" strokeWidth="1" opacity=".5" />
              </pattern>
            </defs>
            <g id="gzones" fill="none" strokeLinecap="round" />
            <g id="gticks" />
            <g id="gnums" fontFamily="var(--font-mono),monospace" fontSize="12" fill="#5B6672" />
            <path d="M76 96 A118 118 0 0 1 148 58" fill="none" stroke="#7A8797" strokeWidth="2" strokeLinecap="round" opacity=".5" />
            <g id="gneedle">
              <path d="M180 178 L174 168 L178 84 L180 76 L182 84 L186 168 Z" fill="#E6E9ED" />
              <circle cx="180" cy="178" r="13" fill="#171B22" stroke="#3A4350" strokeWidth="2.4" />
              <circle cx="180" cy="178" r="4.6" fill="#0F141A" stroke="#5B6672" strokeWidth="1.4" />
              <line x1="177" y1="175" x2="183" y2="181" stroke="#5B6672" strokeWidth="1.4" />
            </g>
            <path id="garcRisk" d="" fill="url(#ghatch)" opacity="0" />
          </svg>
          <div className="scoreline"><span id="scoreNum">0</span><small> / 100</small></div>
          <div className="zona"><span className="selloe" id="zonaSello" style={{ opacity: 0 }}>Zona de riesgo</span></div>
        </section>

        {/* 2 · el arquetipo (glifo genérico: los 8 propios los debe FRONT) */}
        <section className="panel" id="pArq">
          <div className="plabel">Arquetipo detectado · lo que tu perfil dice que eres</div>
          <div className="arq">
            <svg viewBox="0 0 120 120">
              <g id="arqSeal" transform="rotate(-5 60 60)">
                <circle cx="60" cy="60" r="54" fill="rgba(16,19,24,.4)" stroke="#4FD9C2" strokeWidth="2.4" />
                <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(79,217,194,.4)" strokeWidth="1.2" strokeDasharray="4 5" />
                <g
                  id="arqGlyph"
                  transform="translate(32.4 32.4) scale(1.15)"
                  fill="none"
                  stroke="#4FD9C2"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            </svg>
            <div>
              <h2 className="display">{nombre}</h2>
              <div className="conf">
                <span className="clabel">Confianza de la lectura · <b id="confNum" style={{ color: 'var(--ink)' }}>0</b>%</span>
                <div className="track"><i id="confBar" /></div>
              </div>
            </div>
          </div>
        </section>

        {/* 3 · la lectura */}
        <section className="panel lectura" id="pLectura">
          <div className="plabel">La lectura de 200 milisegundos · sin anestesia</div>
          <p className="pq2"><span className="sub2">«<u id="lecturaTxt">{props.lectura}</u>»</span></p>
        </section>

        {/* 4 · lo sellado (teaser del Kit) */}
        <section className="panel sellado" id="s1">
          <div className="contenido">
            <svg viewBox="0 0 500 190">
              <rect x="20" y="20" width="120" height="150" rx="8" fill="#1A212B" stroke="#262C36" strokeWidth="1.5" />
              <circle cx="80" cy="70" r="22" fill="#232C37" /><path d="M46 150 C58 116 102 116 114 150 Z" fill="#232C37" />
              <circle cx="80" cy="70" r="30" fill="none" stroke="#4FD9C2" strokeWidth="1.4" />
              <line x1="112" y1="60" x2="170" y2="44" stroke="#4FD9C2" strokeWidth="1.2" />
              <text x="174" y="48" fontFamily="var(--font-mono),monospace" fontSize="12" fill="#E6E9ED">DICE: PROFESIONAL</text>
              <line x1="106" y1="96" x2="170" y2="112" stroke="#C94B32" strokeWidth="1.2" />
              <text x="174" y="116" fontFamily="var(--font-mono),monospace" fontSize="12" fill="#C94B32">LUZ FRÍA · INTERIOR</text>
              <rect x="330" y="30" width="150" height="26" rx="4" fill="#151A22" stroke="#262C36" />
              <rect x="330" y="66" width="150" height="26" rx="4" fill="#151A22" stroke="#262C36" />
              <rect x="330" y="102" width="150" height="26" rx="4" fill="#151A22" stroke="#262C36" />
              <text x="340" y="47" fontFamily="var(--font-mono),monospace" fontSize="11" fill="#8C96A3">CALIDAD 62/100</text>
            </svg>
          </div>
          <div className="velo">
            <svg className="sutura" preserveAspectRatio="none" />
            <span className="selloe s-cy">Sellado</span>
            <div className="queHay">La lectura foto por foto de tus {nFotos} fotos<small>qué dice cada una y qué la traiciona</small></div>
          </div>
        </section>

        <section className="panel sellado" id="s2">
          <div className="contenido">
            <svg viewBox="0 0 500 190">
              <g fontFamily="var(--font-mono),monospace" fontSize="11" fill="#8C96A3">
                <rect x="24" y="30" width="90" height="120" rx="6" fill="#1A212B" stroke="#4FD9C2" strokeWidth="1.6" />
                <text x="40" y="100">FOTO 4</text>
                <rect x="140" y="30" width="90" height="120" rx="6" fill="#1A212B" stroke="#262C36" strokeWidth="1.4" />
                <text x="156" y="100">FOTO 2</text>
                <rect x="256" y="30" width="90" height="120" rx="6" fill="#1A212B" stroke="#262C36" strokeWidth="1.4" />
                <text x="272" y="100">FOTO 6</text>
                <rect x="372" y="30" width="90" height="120" rx="6" fill="#1A212B" stroke="#C94B32" strokeWidth="1.6" strokeDasharray="6 5" />
                <text x="388" y="100">FUERA</text>
              </g>
              <path d="M118 90 L136 90 M234 90 L252 90 M350 90 L368 90" stroke="#4FD9C2" strokeWidth="2" />
            </svg>
          </div>
          <div className="velo">
            <svg className="sutura" preserveAspectRatio="none" />
            <span className="selloe s-cy">Sellado</span>
            <div className="queHay">Tu plan de fotos completo<small>cuáles conservar, cuáles reemplazar y el orden que convierte</small></div>
          </div>
        </section>

        <section className="panel sellado" id="s3">
          <div className="contenido">
            <svg viewBox="0 0 500 150">
              <g fontFamily="var(--font-body),sans-serif" fontSize="14" fill="#E6E9ED">
                <path d="M36 40 L43 48 L56 30" fill="none" stroke="#4FD9C2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <text x="72" y="45">Quick win 01 · alto impacto, cero costo</text>
                <path d="M36 84 L43 92 L56 74" fill="none" stroke="#4FD9C2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <text x="72" y="89">Quick win 02 · antes de tu próxima semana</text>
                <path d="M36 128 L43 136 L56 118" fill="none" stroke="#4FD9C2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <text x="72" y="133">Gap contra tu arquetipo objetivo</text>
              </g>
            </svg>
          </div>
          <div className="velo">
            <svg className="sutura" preserveAspectRatio="none" />
            <span className="selloe s-cy">Sellado</span>
            <div className="queHay">Quick wins + tu plan contra el objetivo<small>lo accionable, ordenado por impacto</small></div>
          </div>
        </section>

        {/* 5 · desbloqueo */}
        <section className="unlock">
          <h2 className="display">Destrabá el tablero<br />completo.</h2>
          <div className="precio">Kit · US$ 19 <small>una sola vez</small></div>
          {pedido === 'listo' ? (
            <p style={{ color: 'var(--signal)', fontWeight: 600 }}>
              Listo, quedó anotado. Te escribimos al mail con el link de pago.
            </p>
          ) : (
            <button className="btn" disabled={pedido === 'enviando'} onClick={() => void pedirKit()}>
              {pedido === 'enviando' ? 'Anotando…' : 'Desbloquear con el Kit'}
            </button>
          )}
          {errorPedido && (
            <p className="micro" style={{ color: 'var(--rust)' }}>{errorPedido}</p>
          )}
          <p className="micro">Garantía de 30 días: si tu match rate no mejora, te devolvemos el dinero.</p>
        </section>

        {props.onRehacer && (
          <p style={{ textAlign: 'center', marginTop: '1.6rem' }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '.85rem', padding: '.7rem 1.4rem' }}
              onClick={props.onRehacer}
            >
              Rehacer análisis con fotos nuevas
            </button>
          </p>
        )}
      </main>
    </div>
  );
}

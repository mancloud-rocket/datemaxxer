'use client';

/**
 * LA MESA DE EVIDENCIA · set piece "el depósito de pruebas" (porteo fiel de
 * design/app/mesa.html). Fotos reales (no demo): cada una cae, se asienta
 * con su inclinación y se estampa como prueba numerada. El marco es la
 * carpeta del expediente (esquineros + borde punteado, se redibuja al alto real).
 */

import { useEffect, useRef, useState } from 'react';
import { Region } from '@percentil/contracts';
import { ARQUETIPOS, buildGlifo } from '../../lib/glifos';
import { prepararFoto } from '../../lib/imagen';
import { gsap, mk, stampIn } from '../../lib/motion';

const MIN = 4;
const MAX = 9;
const TILT = [-2.4, 1.7, -1.3, 2.1, -1.9, 1.4, -2.2, 1.1, -1.6];
const REGIONES = Region.options;

type Prueba = { id: string; file: File; url: string };

let uid = 0;

export function Mesa(props: {
  error: string | null;
  enviando: boolean;
  onEnviar: (form: FormData) => void;
}) {
  const [pruebas, setPruebas] = useState<Prueba[]>([]);
  const [bio, setBio] = useState('');
  const [region, setRegion] = useState<string>('neutro');
  const [arquetipo, setArquetipo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const marcoRef = useRef<SVGSVGElement>(null);
  const expedienteRef = useRef<HTMLDivElement>(null);
  const evgridRef = useRef<HTMLDivElement>(null);
  const glifselRef = useRef<HTMLDivElement>(null);
  const prevN = useRef(0);
  const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* marco SVG del expediente: se redibuja al alto real (crece con la grilla) */
  useEffect(() => {
    const draw = () => {
      const svg = marcoRef.current;
      const box = expedienteRef.current;
      if (!svg || !box) return;
      const w = box.clientWidth, h = box.clientHeight;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.innerHTML = '';
      mk('line', { x1: 8, y1: 2, x2: w - 8, y2: 2 }, svg);
      mk('line', { x1: 8, y1: h - 2, x2: w - 8, y2: h - 2 }, svg);
      mk('line', { x1: 2, y1: 8, x2: 2, y2: h - 8 }, svg);
      mk('line', { x1: w - 2, y1: 8, x2: w - 2, y2: h - 8 }, svg);
      const cn = 16;
      mk('path', { d: `M2 ${cn} L2 2 L${cn} 2` }, svg);
      mk('path', { d: `M${w - cn} 2 L${w - 2} 2 L${w - 2} ${cn}` }, svg);
      mk('path', { d: `M2 ${h - cn} L2 ${h - 2} L${cn} ${h - 2}` }, svg);
      mk('path', { d: `M${w - cn} ${h - 2} L${w - 2} ${h - 2} L${w - 2} ${h - cn}` }, svg);
    };
    const raf = requestAnimationFrame(draw);
    window.addEventListener('resize', draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', draw);
    };
  }, [pruebas.length]);

  /* animación de "caída a la mesa" para la última prueba agregada */
  useEffect(() => {
    const n = pruebas.length;
    if (n > prevN.current && !REDUCED) {
      const last = evgridRef.current?.children[n - 1] as HTMLElement | undefined;
      if (last) {
        const tilt = TILT[(n - 1) % TILT.length]!;
        gsap.fromTo(
          last,
          { y: -52, rotate: tilt - 8, autoAlpha: 0, scale: 1.06 },
          { y: 0, rotate: tilt, autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(1.5)' },
        );
        const tag = last.querySelector('.tag');
        if (tag) stampIn(tag);
      }
    }
    prevN.current = n;
  }, [pruebas.length, REDUCED]);

  /* glifos: selector de arquetipos (una vez) */
  useEffect(() => {
    const box = glifselRef.current;
    if (!box) return;
    box.innerHTML = '';
    ARQUETIPOS.forEach((a) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'glif';
      el.dataset.slug = a.slug;
      el.appendChild(buildGlifo(a.slug, { size: 34, stroke: 2 }));
      const gl = document.createElement('span');
      gl.className = 'gl';
      gl.textContent = a.label;
      el.appendChild(gl);
      const ck = document.createElement('span');
      ck.className = 'check';
      ck.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 13 L10 18 L19 6"/></svg>';
      el.appendChild(ck);
      el.addEventListener('click', () => setArquetipo((cur) => (cur === a.slug ? null : a.slug)));
      box.appendChild(el);
    });
  }, []);

  /* refleja el arquetipo elegido en el DOM del selector (evita re-render de gsap) */
  useEffect(() => {
    const box = glifselRef.current;
    if (!box) return;
    box.querySelectorAll('.glif').forEach((g) => {
      const on = (g as HTMLElement).dataset.slug === arquetipo;
      g.classList.toggle('on', on);
      if (on && !REDUCED) {
        const svg = g.querySelector('svg');
        if (svg) gsap.fromTo(svg, { scale: 0.8 }, { scale: 1, duration: 0.4, ease: 'back.out(2)' });
      }
    });
  }, [arquetipo, REDUCED]);

  async function agregar(list: FileList | null) {
    if (!list || !list.length) return;
    setAviso(null);
    const imgs = Array.from(list);
    if (pruebas.length + imgs.length > MAX) {
      setAviso(`Son <b>${MAX} fotos como máximo</b>. Ya tienes ${pruebas.length}: elige las mejores, no todas.`);
      return;
    }
    for (const f of imgs) {
      if (!/image\/(jpeg|png)/.test(f.type)) {
        setAviso(`<b>${f.name || 'Ese archivo'}</b> no es JPG ni PNG. La mesa solo admite fotos.`);
        return;
      }
      if (f.size > 12 * 1024 * 1024) {
        setAviso(`<b>${f.name || 'Una foto'}</b> pesa más de 12&nbsp;MB. Bájale el tamaño y vuelve a intentar.`);
        return;
      }
    }
    // Se redimensionan acá: sube ~10x más rápido en móvil y no revienta la memoria
    // del server. La miniatura se genera del archivo ya preparado.
    const preparadas = await Promise.all(imgs.map(prepararFoto));
    setPruebas((cur) => [
      ...cur,
      ...preparadas.map((f) => ({ id: `p${uid++}`, file: f, url: URL.createObjectURL(f) })),
    ]);
  }

  function descartar(id: string) {
    const el = evgridRef.current?.querySelector(`.ev[data-id="${id}"]`) as HTMLElement | null;
    const done = () => setPruebas((cur) => cur.filter((p) => p.id !== id));
    if (el && !REDUCED) gsap.to(el, { y: 26, autoAlpha: 0, scale: 0.92, duration: 0.32, ease: 'power2.in', onComplete: done });
    else done();
  }

  function hacerPortada(id: string) {
    setPruebas((cur) => {
      const i = cur.findIndex((p) => p.id === id);
      if (i <= 0) return cur;
      const next = [...cur];
      const [p] = next.splice(i, 1);
      next.unshift(p!);
      return next;
    });
    requestAnimationFrame(() => {
      const first = evgridRef.current?.children[0] as HTMLElement | undefined;
      if (first && !REDUCED) gsap.fromTo(first, { scale: 1.05, autoAlpha: 0.4 }, { scale: 1, autoAlpha: 1, duration: 0.4, ease: 'back.out(1.6)' });
    });
  }

  function enviar() {
    if (pruebas.length < MIN) return;
    const form = new FormData();
    for (const p of pruebas) form.append('photos', p.file);
    form.append('bio', bio);
    form.append('region', region);
    if (arquetipo) form.append('arquetipo_objetivo', arquetipo);
    props.onEnviar(form);
  }

  const n = pruebas.length;
  const has = n > 0;
  const faltan = MIN - n;
  const errorMostrado = aviso ?? (props.error ? `<b>${props.error}</b>` : null);

  return (
    <div className="dmx-mesa">
      <div className="apphud">
        <span className="chip">Datemaxxer · Medición 001</span>
        <div className="fase">
          <b>{n >= MIN ? 'LISTO PARA MEDIR' : 'CARGANDO PERFIL'}</b>
          <small>{n} de {MAX} fotos</small>
        </div>
        <div className="progress"><i style={{ transform: `scaleX(${Math.min(n / MIN, 1)})`, background: n >= MIN ? 'var(--signal)' : undefined }} /></div>
      </div>

      <main className="wrap">
        <header className="head">
          <p className="kicker k-ox"><i />Tu perfil real, sin maquillar</p>
          <h1 className="display">Vamos a medir<br />dónde estás.</h1>
          <p className="sub">
            Sube entre 4 y 9 fotos, las mismas que tienes en las apps. Las leemos como las lee
            el algoritmo, y como las lee ella en 200 milisegundos.
          </p>
        </header>

        <section className="expediente" ref={expedienteRef}>
          <svg className="marco" ref={marcoRef} preserveAspectRatio="none" />

          {has && (
            <div className="tallybar">
              <div className={`n${n >= MIN ? ' ok' : ''}`}><b>{n}</b> de {MAX} fotos · mínimo {MIN}</div>
              <div className={`pips${n >= MIN ? ' ok' : ''}`}>
                {Array.from({ length: MAX }, (_, i) => <span key={i} className={i < n ? 'on' : ''} />)}
              </div>
            </div>
          )}

          {!has ? (
            <div
              className={`empty${drag ? ' drag' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); void agregar(e.dataTransfer.files); }}
            >
              <svg className="icon" viewBox="0 0 48 48">
                <rect x="7" y="14" width="34" height="26" rx="3" />
                <path d="M7 32 L17 23 L25 30 L33 22 L41 30" />
                <circle cx="17" cy="21" r="2.4" />
              </svg>
              <h3>Sube tus fotos aquí</h3>
              <p>Arrástralas o <span className="pick">elígelas desde tu teléfono</span>. Entre 4 y 9, formato JPG o PNG, hasta 12&nbsp;MB cada una.</p>
            </div>
          ) : (
            <div
              className="evgrid"
              ref={evgridRef}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); void agregar(e.dataTransfer.files); }}
            >
              {pruebas.map((p, i) => (
                <div className={`ev${i === 0 ? ' first' : ''}`} data-id={p.id} key={p.id}>
                  <div className="viz"><img src={p.url} alt="" /></div>
                  <div className="scrim" />
                  <span className="corner tl" /><span className="corner tr" />
                  <span className="corner bl" /><span className="corner br" />
                  <span className="tag">FOTO {String(i + 1).padStart(2, '0')}</span>
                  <span className="portada">Portada</span>
                  <div className="acts">
                    {i !== 0 && (
                      <button className="act port" title="Hacer portada" onClick={() => hacerPortada(p.id)}>
                        <svg viewBox="0 0 24 24"><path d="M12 3 l2.5 5.5 6 .5 -4.5 4 1.4 6 -5.4-3.2 -5.4 3.2 1.4-6 -4.5-4 6-.5Z" /></svg>
                      </button>
                    )}
                    <button className="act desc" title="Descartar" onClick={() => descartar(p.id)}>
                      <svg viewBox="0 0 24 24"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
                    </button>
                  </div>
                </div>
              ))}
              {n < MAX && (
                <button type="button" className="addtile" onClick={() => fileRef.current?.click()}>
                  <svg className="plus" viewBox="0 0 48 48"><line x1="24" y1="12" x2="24" y2="36" /><line x1="12" y1="24" x2="36" y2="24" /></svg>
                  <span>Agregar foto</span>
                </button>
              )}
            </div>
          )}

          {errorMostrado && (
            <div className="aviso show">
              <span className="selloe">Rechazada</span>
              <p dangerouslySetInnerHTML={{ __html: errorMostrado }} />
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            hidden
            onChange={(e) => { void agregar(e.target.files); e.target.value = ''; }}
          />
        </section>

        <section className="ctx">
          <div className="field">
            <div className="lab"><span className="k">Tu bio, tal cual</span><span className="opt">Opcional</span></div>
            <p className="hint">Pégala sin retocar. Si dice una cosa y las fotos dicen otra, eso es un hallazgo.</p>
            <textarea maxLength={500} placeholder="Pega aquí la bio que tienes hoy en la app…" value={bio} onChange={(e) => setBio(e.target.value)} />
            <div className="counter">{bio.length} / 500</div>
          </div>

          <div className="field">
            <div className="lab"><span className="k">¿Qué quieres proyectar?</span><span className="opt">Opcional</span></div>
            <p className="hint">Elige un arquetipo objetivo y medimos la distancia entre lo que quieres y lo que hoy transmites.</p>
            <div className="glifsel" ref={glifselRef} />
          </div>

          <div className="field">
            <div className="lab"><span className="k">¿Cómo hablas?</span></div>
            <p className="hint">Ajustamos el registro del informe a tu región.</p>
            <div className="regsel">
              {REGIONES.map((r) => (
                <button key={r} type="button" className={`reg${region === r ? ' on' : ''}`} onClick={() => setRegion(r)}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>

      <div className="ctabar">
        <div className="inner">
          <div className="count">
            <b>{n}</b> / {MAX} fotos
            <small>{n < MIN ? `te falta${faltan > 1 ? 'n' : ''} ${faltan} para empezar` : 'listo para medir'}</small>
          </div>
          <button className="btn" disabled={n < MIN || props.enviando} onClick={enviar}>
            {props.enviando ? 'Midiendo…' : 'Medir mi perfil'}
          </button>
        </div>
      </div>
    </div>
  );
}

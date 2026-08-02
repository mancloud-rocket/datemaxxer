'use client';

/**
 * Informe de perfil ajeno (F5 v2.0).
 *
 * Orden deliberado: el veredicto de inversión primero, porque es la única línea
 * que el usuario va a leer siempre. Después el gap (el número contra su número),
 * después los openers (lo accionable), y recién al final la lectura fina.
 *
 * Nada de esto es un set piece: es un instrumento. La única animación es la
 * entrada en cascada y las barras creciendo.
 */

import { useEffect, useRef } from 'react';
import type { ProfileRead } from '@percentil/contracts';
import { gsap } from '../../lib/motion';

const BUCKETS: Record<string, string> = {
  bajo: 'escalón bajo',
  medio_bajo: 'escalón medio-bajo',
  medio: 'escalón medio',
  alto: 'escalón alto',
  muy_alto: 'escalón muy alto',
  top: 'top del pool',
};

const VEREDICTOS: Record<string, { label: string; clase: string }> = {
  perseguir: { label: 'Vale el esfuerzo', clase: 'v-ok' },
  oportunista: { label: 'Hay una grieta', clase: 'v-medio' },
  volumen_bajo_esfuerzo: { label: 'Bajo esfuerzo', clase: 'v-medio' },
  no_vale: { label: 'No vale', clase: 'v-mal' },
};

const TIERS: Record<string, string> = {
  el_arriba: 'Estás arriba',
  paridad: 'Mismo escalón',
  ella_un_tier: 'Ella, un escalón arriba',
  ella_dos_tiers: 'Ella, dos escalones arriba',
};

const RIESGOS: Record<string, string> = { bajo: 'riesgo bajo', medio: 'riesgo medio', alto: 'riesgo alto' };

const NIVEL_PROB: Record<string, string> = {
  muy_baja: 'Muy baja',
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
};

const COMPONENTES = [
  { clave: 'facial' as const, label: 'Cara' },
  { clave: 'presentacion' as const, label: 'Presentación' },
  { clave: 'produccion' as const, label: 'Producción' },
];

export function InformePerfil(props: { lectura: ProfileRead; onOtra?: (() => void) | undefined }) {
  const { lectura: r } = props;
  const root = useRef<HTMLDivElement>(null);
  const armado = useRef(false);

  useEffect(() => {
    const el = root.current;
    if (!el || armado.current) return;
    armado.current = true;
    const qa = new URLSearchParams(window.location.search).get('qa') === '1';
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (qa || REDUCED) return; // ?qa=1: virtual-time no es confiable con GSAP

    const ctx = gsap.context(() => {
      gsap.set('.bloque', { autoAlpha: 0, y: 22 });
      gsap.to('.bloque', { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.09, ease: 'power2.out' });
      el.querySelectorAll<HTMLElement>('.track i').forEach((barra, k) => {
        gsap.fromTo(barra, { width: 0 }, { width: barra.style.width, duration: 0.7, delay: 0.3 + k * 0.08, ease: 'power3.out' });
      });
    }, el);
    return () => ctx.revert();
  }, []);

  const ver = VEREDICTOS[r.inversion.veredicto] ?? VEREDICTOS.oportunista!;
  const dudosa = r.autenticidad.veredicto !== 'genuino';

  return (
    <div className="dmx-perfil" ref={root}>
      <header className="chead bloque">
        <p className="kicker"><i />Su perfil, medido</p>
        <h1 className="display">La lectura.</h1>
      </header>

      {/* Autenticidad primero cuando hay sospecha: le ahorra todo lo demás. */}
      {dudosa && (
        <section className="bloque alerta">
          <span className="selloe">
            {r.autenticidad.veredicto === 'probable_no_genuino' ? 'Probablemente no es real' : 'Perfil dudoso'}
          </span>
          <ul>
            {r.autenticidad.señales.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </section>
      )}

      {/* 1 · el veredicto: la única línea que siempre se lee */}
      <section className={`bloque veredicto ${ver.clase}`}>
        <div className="vlabel">{ver.label}</div>
        <p className="vresumen">{r.inversion.resumen}</p>
        <div className="vmeta">
          {r.inversion.mensajes_antes_de_soltar > 0
            ? `${r.inversion.mensajes_antes_de_soltar} mensajes antes de soltar`
            : 'ni lo abras'}
        </div>
        <ul className="vevidencia">
          {r.inversion.evidencia.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </section>

      {/* 2 · el gap: su número contra el tuyo */}
      <section className="bloque panel">
        <div className="plabel">Dónde está ella · y a qué distancia tuya</div>
        <div className="gapfila">
          <div className="numero">
            {r.indice.global}
            <small>± {r.indice.margen}</small>
          </div>
          <div className="getiqueta">
            <span className="selloe s-cy">{BUCKETS[r.indice.bucket_global] ?? r.indice.bucket_global}</span>
            {r.gap ? (
              <>
                <b className="gtier">{TIERS[r.gap.tier] ?? r.gap.tier}</b>
                <p className="glectura">{r.gap.lectura}</p>
              </>
            ) : (
              <p className="glectura sinmedir">
                Todavía no medimos tu perfil, así que no podemos decirte cuánto te separa de ella.
                Es lo que más cambia la lectura.
              </p>
            )}
          </div>
        </div>

        {r.gap ? (
          <p className="estrategia">{r.gap.estrategia_implicada}</p>
        ) : (
          <a className="btn" href="/app">Medir mi perfil</a>
        )}

        <div className="desglose">
          {COMPONENTES.map(({ clave, label }) => {
            const c = r.indice[clave];
            return (
              <div className={`comp${c === null ? ' vacio' : ''}`} key={clave}>
                <div className="ctop">
                  <b>{label}</b>
                  <span className="cnum">{c === null ? 'sin datos' : c.score}</span>
                </div>
                <div className="track"><i style={{ width: c === null ? '0%' : `${c.score}%` }} /></div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3 · qué chance real hay */}
      <section className="bloque panel">
        <div className="plabel">Tu chance acá</div>
        <div className="probfila">
          <b className="pnivel">{NIVEL_PROB[r.probabilidad_respuesta.nivel] ?? r.probabilidad_respuesta.nivel}</b>
          <span className="pvs">{r.probabilidad_respuesta.vs_baseline}× tu promedio</span>
        </div>
        {r.probabilidad_respuesta.palancas.length > 0 && (
          <ul className="palancas">
            {r.probabilidad_respuesta.palancas.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        <p className="micro">{r.volumen_matches.implicancia}</p>
      </section>

      {/* 4 · lo accionable */}
      <section className="bloque panel">
        <div className="plabel">Para abrir · {r.openers.length} {r.openers.length === 1 ? 'opción' : 'opciones'}</div>
        <div className="openers">
          {r.openers.map((o) => (
            <div className="opener" key={o.texto}>
              <div className="otop">
                <span className="otono">{o.tono.replace('_', ' ')}</span>
                <span className={`oriesgo r-${o.riesgo}`}>{RIESGOS[o.riesgo] ?? o.riesgo}</span>
              </div>
              <p className="otexto">{o.texto}</p>
              <p className="oporque">{o.por_que_funciona}</p>
              <p className="olicencia">Se apoya en: {o.licencia}</p>
            </div>
          ))}
        </div>
      </section>

      {r.ganchos.length > 0 && (
        <section className="bloque panel">
          <div className="plabel">Ganchos reales de su perfil</div>
          <div className="ganchos">
            {r.ganchos.map((g) => (
              <div className="gancho" key={g.dato}>
                <b>{g.dato}</b>
                <p>{g.uso}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {r.expectativa_de_plan && (
        <section className="bloque panel">
          <div className="plabel">Qué estándar vende su perfil</div>
          <p className="traduccion">{r.expectativa_de_plan.traduccion}</p>
          <ul className="evidencia">
            {r.expectativa_de_plan.evidencia.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </section>
      )}

      <section className="bloque panel">
        <div className="plabel">Cómo escribirle</div>
        <p className="traduccion">{r.registro_sugerido.tono}</p>
        {r.registro_sugerido.evitar.length > 0 && (
          <ul className="evitar">
            {r.registro_sugerido.evitar.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </section>

      <p className="disclaimer bloque">{r.disclaimer}</p>

      {props.onOtra && (
        <p className="bloque" style={{ textAlign: 'center', marginTop: '1.6rem' }}>
          <button className="btn btn-ghost" onClick={props.onOtra}>Leer otro perfil</button>
        </p>
      )}
    </div>
  );
}

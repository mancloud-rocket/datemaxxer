'use client';

/**
 * F3 - escribir la bio.
 *
 * Tres variantes con ángulos distintos, cada una con su "por qué" visible. La
 * decisión de UI que importa: el `por_que` no está escondido en un tooltip, va
 * debajo del texto. El objetivo del producto es que el tipo aprenda el patrón,
 * no que copie para siempre.
 */

import { useCallback, useState } from 'react';
import type { BioResult } from '@percentil/contracts';
import { ApiError, escribirBio } from '../../lib/api';
import { getAccessToken } from '../../lib/supabase';
import { evento } from '../../lib/analitica';

const INTENCIONES = [
  { v: 'relacion' as const, label: 'Algo serio' },
  { v: 'casual' as const, label: 'Casual' },
  { v: 'abierto' as const, label: 'Abierto' },
];

const PLATAFORMAS = ['tinder', 'bumble', 'hinge', 'otra'] as const;

/** Topes reales de cada app, para avisar antes de que la pegue. */
const TOPES: Record<string, number> = { tinder: 500, bumble: 300, hinge: 150, otra: 500 };

export function Bio() {
  const [intencion, setIntencion] = useState<'relacion' | 'casual' | 'abierto'>('relacion');
  const [plataforma, setPlataforma] = useState<string>('tinder');
  const [datos, setDatos] = useState<string[]>(['', '', '']);
  const [bioActual, setBioActual] = useState('');
  const [resultado, setResultado] = useState<BioResult | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinPlan, setSinPlan] = useState(false);
  const [copiada, setCopiada] = useState<string | null>(null);

  const generar = useCallback(async () => {
    const limpios = datos.map((d) => d.trim()).filter((d) => d !== '');
    if (limpios.length === 0) {
      setError('Poné al menos un dato real tuyo. Sin eso la bio sale genérica.');
      return;
    }
    setError(null);
    setCargando(true);
    const token = await getAccessToken();
    if (!token) {
      setError('Tu sesión se interrumpió. Recarga la página.');
      setCargando(false);
      return;
    }
    try {
      const salida = await escribirBio(token, {
        intencion,
        plataforma: plataforma as 'tinder',
        datos: limpios,
        ...(bioActual.trim() !== '' ? { bio_actual: bioActual.trim() } : {}),
      });
      // Después de la llamada: si falla, no cuenta como bio generada.
      evento('bio_generada', { intencion, plataforma });
      setResultado(salida);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'plan_requerido') setSinPlan(true);
      else setError(err instanceof ApiError ? err.message : 'No pudimos escribirla.');
    } finally {
      setCargando(false);
    }
  }, [intencion, plataforma, datos, bioActual]);

  if (sinPlan) {
    return (
      <div className="dmx-bio">
        <div className="rechazo">
          <span className="selloe">Viene con el Kit</span>
          <h1 className="display">Tu bio, escrita.</h1>
          <p>Tres variantes con ángulos distintos, en tu registro y sin clichés. Viene con el Kit.</p>
          <a className="btn" href="/app">Ver los planes</a>
        </div>
      </div>
    );
  }

  const tope = TOPES[plataforma] ?? 500;

  return (
    <div className="dmx-bio">
      <header className="chead">
        <p className="kicker"><i />Lo que dice tu perfil</p>
        <h1 className="display">Tu bio.</h1>
        <p className="hint">
          La bio no rescata una foto mala, pero una mala te cuesta matches. Tres variantes
          para que elijas la que suena a vos.
        </p>
      </header>

      <section className="campos">
        <div className="campo-label">
          <span>¿Qué buscás?</span>
          <div className="chips">
            {INTENCIONES.map((i) => (
              <button key={i.v} type="button" className={`chip${intencion === i.v ? ' on' : ''}`} onClick={() => setIntencion(i.v)}>
                {i.label}
              </button>
            ))}
          </div>
        </div>

        <div className="campo-label">
          <span>¿Dónde va?</span>
          <div className="chips">
            {PLATAFORMAS.map((p) => (
              <button key={p} type="button" className={`chip${plataforma === p ? ' on' : ''}`} onClick={() => setPlataforma(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="campo-label">
          <span>Tres cosas reales tuyas</span>
          <p className="ayuda">
            Concretas. &quot;Corro los domingos por la rambla&quot; sirve; &quot;me gusta el deporte&quot; no.
            Con esto se escribe la bio, así que nada inventado.
          </p>
          {datos.map((d, i) => (
            <input
              key={i}
              className="campo"
              maxLength={200}
              placeholder={['qué hacés', 'algo que te guste de verdad', 'algo que te haga distinto'][i]}
              value={d}
              onChange={(e) => setDatos((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
        </div>

        <div className="campo-label">
          <span>Tu bio de ahora</span>
          <p className="ayuda">Opcional. Si la pegás, te decimos qué le estaba costando.</p>
          <textarea
            className="campo"
            rows={3}
            maxLength={2000}
            value={bioActual}
            onChange={(e) => setBioActual(e.target.value)}
          />
        </div>
      </section>

      {error && <p className="err-general">{error}</p>}

      <div className="accion">
        <button className="btn" disabled={cargando} onClick={() => void generar()}>
          {cargando ? 'Escribiendo…' : resultado ? 'Escribir otras' : 'Escribir mi bio'}
        </button>
      </div>

      {resultado && (
        <div className="salida">
          {resultado.diagnostico_anterior && (
            <div className="diagnostico">
              <b>Tu bio de ahora</b>
              <p>{resultado.diagnostico_anterior}</p>
            </div>
          )}

          {resultado.variantes.map((v) => (
            <div className="variante" key={v.texto}>
              <div className="vtop">
                <span className="angulo">{v.angulo}</span>
                <span className={`largo${v.largo > tope ? ' pasado' : ''}`}>
                  {v.largo}/{tope}
                </span>
              </div>
              <p className="texto">{v.texto}</p>
              <p className="porque">{v.por_que}</p>
              <button
                className="copiar"
                onClick={() => {
                  void navigator.clipboard?.writeText(v.texto);
                  setCopiada(v.texto);
                  setTimeout(() => setCopiada(null), 2000);
                }}
              >
                {copiada === v.texto ? 'Copiada' : 'Copiar'}
              </button>
            </div>
          ))}

          {resultado.prompts.length > 0 && (
            <div className="prompts">
              <div className="plabel">Prompts · acá se gana o se pierde</div>
              {resultado.prompts.map((p) => (
                <div className="prompt" key={p.respuesta}>
                  <b>{p.prompt}</b>
                  <p className="texto">{p.respuesta}</p>
                  <p className="porque">{p.por_que}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

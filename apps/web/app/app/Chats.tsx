'use client';

/**
 * F4 - copiloto de chat.
 *
 * Dos vistas: la lista de conversaciones y el detalle de una.
 *
 * En el detalle el orden es: veredicto arriba con su evidencia, después los
 * números, después las sugerencias. El veredicto es lo que el usuario abrió a
 * buscar; los números están para que le crea.
 *
 * El botón de feedback aparece cuando ya hubo un veredicto. Es lo único que va a
 * permitir saber si el motor acierta, así que se pide en la pantalla y no en un
 * mail que nadie contesta.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatTurnAnalysis } from '@percentil/contracts';
import {
  analizarTurno,
  ApiError,
  crearConversacion,
  mandarFeedback,
  misConversaciones,
  obtenerConversacion,
  type ConversacionDetalle,
  type ConversacionVista,
} from '../../lib/api';
import { prepararFoto } from '../../lib/imagen';
import { getAccessToken } from '../../lib/supabase';
import { evento } from '../../lib/analitica';

const VEREDICTOS: Record<string, { label: string; clase: string }> = {
  invertir_mas: { label: 'Invertí más', clase: 'v-ok' },
  mantener: { label: 'Mantené', clase: 'v-ok' },
  proponer_salida_ahora: { label: 'Proponé salir, ahora', clase: 'v-ok' },
  bajar_energia: { label: 'Bajá la energía', clase: 'v-medio' },
  dejar_morir: { label: 'Dejalo morir', clase: 'v-mal' },
};

const TENDENCIAS: Record<string, string> = {
  creciente: 'tarda cada vez más',
  estable: 'estable',
  decreciente: 'contesta cada vez más rápido',
};

const PROFUNDIDAD: Record<string, string> = {
  pregunta: 'pregunta',
  comparte: 'comparte',
  responde_solo: 'solo responde',
};

const FEEDBACK = [
  { v: 'salio_bien', label: 'Salió bien' },
  { v: 'no_contesto_mas', label: 'No contestó más' },
  { v: 'sigue_igual', label: 'Sigue igual' },
  { v: 'lo_solte', label: 'Lo solté' },
];

export function Chats() {
  const [lista, setLista] = useState<ConversacionVista[] | null>(null);
  const [abierta, setAbierta] = useState<ConversacionDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinPlan, setSinPlan] = useState(false);
  const [nueva, setNueva] = useState('');

  const cargar = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      setLista(await misConversaciones(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) setSinPlan(true);
      else setError('No pudimos cargar tus chats.');
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function crear() {
    const label = nueva.trim();
    if (label === '') return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      const c = await crearConversacion(token, label);
      setNueva('');
      setLista((cur) => [c, ...(cur ?? [])]);
      void abrir(c.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'plan_requerido') setSinPlan(true);
      else setError('No pudimos crear el chat.');
    }
  }

  const abrir = useCallback(async (id: string) => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      setAbierta(await obtenerConversacion(token, id));
    } catch {
      setError('No pudimos abrir ese chat.');
    }
  }, []);

  if (sinPlan) {
    return (
      <div className="dmx-chats">
        <div className="rechazo">
          <span className="selloe">Viene con el Copiloto</span>
          <h1 className="display">¿Va a algún lado<br />o estás perdiendo el tiempo?</h1>
          <p>
            Subís las capturas del chat y te decimos qué dicen los números: latencias, quién
            pone más, si reengancha. Con el veredicto adelante.
          </p>
          <a className="btn" href="/app">Ver los planes</a>
        </div>
      </div>
    );
  }

  if (abierta) {
    return <Detalle c={abierta} onVolver={() => { setAbierta(null); void cargar(); }} onRecargar={() => void abrir(abierta.id)} />;
  }

  return (
    <div className="dmx-chats">
      <header className="chead">
        <p className="kicker"><i />Tus conversaciones</p>
        <h1 className="display">Los chats.</h1>
        <p className="hint">Uno por persona. Cada captura que subas se lee junto con lo anterior.</p>
      </header>

      <div className="nueva">
        <input
          className="campo"
          maxLength={60}
          placeholder="Cómo la anotás (Flor de Bumble, la del gimnasio…)"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void crear(); }}
        />
        <button className="btn" disabled={nueva.trim() === ''} onClick={() => void crear()}>Agregar</button>
      </div>

      {error && <p className="err-general">{error}</p>}

      {lista === null ? (
        <div className="loading-row"><span className="dot" />CARGANDO…</div>
      ) : lista.length === 0 ? (
        <p className="vacio">Todavía no anotaste ninguna conversación.</p>
      ) : (
        <div className="lista">
          {lista.map((c) => {
            const v = c.ultimo_veredicto ? VEREDICTOS[c.ultimo_veredicto] : null;
            return (
              <button className="fila" key={c.id} onClick={() => void abrir(c.id)}>
                <div className="quien">
                  <b>{c.label}</b>
                  <small>{c.mensajes} mensajes leídos</small>
                </div>
                {v && <span className={`selloe ${v.clase === 'v-mal' ? '' : 's-cy'}`}>{v.label}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detalle(props: { c: ConversacionDetalle; onVolver: () => void; onRecargar: () => void }) {
  const { c } = props;
  const [archivos, setArchivos] = useState<File[]>([]);
  const [pegado, setPegado] = useState('');
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const ultimo = c.turnos[c.turnos.length - 1]?.analisis ?? null;

  async function analizar() {
    if (archivos.length === 0 && pegado.trim() === '') return;
    setError(null);
    setAnalizando(true);
    const token = await getAccessToken();
    if (!token) {
      setError('Tu sesión se interrumpió. Recarga la página.');
      setAnalizando(false);
      return;
    }
    try {
      const form = new FormData();
      for (const f of archivos) form.append('capturas', await prepararFoto(f), f.name);
      if (pegado.trim() !== '') form.append('pegado', pegado.trim());
      await analizarTurno(token, c.id, form);
      evento('chat_analizado');
      setArchivos([]);
      setPegado('');
      props.onRecargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos leer el chat.');
    } finally {
      setAnalizando(false);
    }
  }

  async function feedback(resultado: string) {
    const token = await getAccessToken();
    if (!token) return;
    await mandarFeedback(token, c.id, resultado).catch(() => undefined);
    props.onRecargar();
  }

  return (
    <div className="dmx-chats">
      <button className="volver" onClick={props.onVolver}>← Todos los chats</button>
      <header className="chead">
        <h1 className="display">{c.label}</h1>
        <p className="hint">{c.mensajes} mensajes leídos · {c.turnos.length} análisis</p>
      </header>

      {ultimo && <Analisis a={ultimo} />}

      {/* El feedback es lo único que permite saber si el motor acierta. */}
      {ultimo && (
        <section className="panel feedback">
          <div className="plabel">
            {c.feedback ? 'Ya nos contaste qué pasó' : `¿Qué pasó? Revisar en ${ultimo.veredicto.revisar_en_dias} días`}
          </div>
          {c.feedback ? (
            <p className="yadicho">{c.feedback}</p>
          ) : (
            <div className="chips">
              {FEEDBACK.map((f) => (
                <button key={f.v} className="chip" onClick={() => void feedback(f.v)}>{f.label}</button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <div className="plabel">Subir un turno nuevo</div>
        <div className="zona" onClick={() => input.current?.click()}>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => setArchivos((cur) => [...cur, ...[...(e.target.files ?? [])]].slice(0, 6))}
          />
          {archivos.length === 0 ? <p>Capturas del chat (hasta 6)</p> : <p>{archivos.length} capturas listas</p>}
        </div>
        <textarea
          className="campo"
          rows={3}
          placeholder="…o pegá el texto del chat acá"
          value={pegado}
          onChange={(e) => setPegado(e.target.value)}
        />
        {error && <p className="err-general">{error}</p>}
        <button
          className="btn"
          disabled={analizando || (archivos.length === 0 && pegado.trim() === '')}
          onClick={() => void analizar()}
        >
          {analizando ? 'Leyendo…' : 'Analizar'}
        </button>
      </section>
    </div>
  );
}

function Analisis(props: { a: ChatTurnAnalysis }) {
  const { a } = props;
  const v = VEREDICTOS[a.veredicto.decision] ?? VEREDICTOS.mantener!;
  const c = a.comportamiento;

  return (
    <>
      <section className={`veredicto ${v.clase}`}>
        <div className="vlabel">{v.label}</div>
        <ul className="vevidencia">
          {a.veredicto.evidencia.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </section>

      <section className="panel numeros">
        <div className="plabel">Los números · calculados, no estimados</div>
        <div className="grilla">
          <div className="dato">
            <b>{c.latencia_promedio_min}′</b>
            <small>tarda en contestar</small>
            <span>{TENDENCIAS[c.latencia_tendencia]}</span>
          </div>
          <div className="dato">
            <b>{c.ratio_esfuerzo}×</b>
            <small>escribe vs vos</small>
            <span>{c.ratio_esfuerzo < 0.7 ? 'pone menos' : 'pareja'}</span>
          </div>
          <div className="dato">
            <b>{c.preguntas_ella_ultimos_10}</b>
            <small>preguntas suyas</small>
            <span>en sus últimos 10</span>
          </div>
          <div className="dato">
            <b>{c.reinicia_ella ? 'Sí' : 'No'}</b>
            <small>reengancha</small>
            <span>{PROFUNDIDAD[c.profundidad]}</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="plabel">Qué mandar</div>
        <div className="sugerencias">
          {a.sugerencias.map((s) => (
            <div className="sug" key={s.texto}>
              <span className="estrategia">{s.estrategia.replace(/_/g, ' ')}</span>
              <p className="texto">{s.texto}</p>
              <p className="porque">{s.por_que}</p>
              <button className="copiar" onClick={() => void navigator.clipboard?.writeText(s.texto)}>Copiar</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

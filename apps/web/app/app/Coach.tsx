'use client';

/**
 * EL COACH · la conversación donde el usuario procesa lo que no es técnico.
 *
 * Decisión de diseño: esto NO es un set piece. El resto de la app es cine
 * (la aguja que barre, el sello que se estampa); acá la única animación es el
 * cursor que late mientras el coach escribe. Una charla con animaciones encima
 * se siente falsa, y el momento en que alguien abre esto es justo el momento en
 * que no quiere espectáculo.
 *
 * El texto entra por streaming: se ve escribir desde el primer segundo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  enviarAlCoach,
  estadoCoach,
  type MensajeCoach,
} from '../../lib/api';
import { getAccessToken } from '../../lib/supabase';

/** Arranques sugeridos, para que la pantalla vacía no sea un cursor mudo. */
const ARRANQUES = [
  'Me ghostearon otra vez y no sé qué hice mal',
  '¿Le escribo o dejo que escriba ella?',
  'Llevo dos semanas sin un match y ya me está pegando',
  'Le estoy tirando a alguien muy por encima de mi nivel',
];

const MENSAJES_QA: MensajeCoach[] = [
  {
    id: 'q1',
    rol: 'user',
    texto: 'Me ghostearon otra vez, ya van tres en el mes.',
    created_at: '2026-08-01T12:00:00Z',
  },
  {
    id: 'q2',
    rol: 'coach',
    texto:
      'Tres en un mes duele, pero mirá el número al derecho: tres conversaciones que arrancaron. Eso no le pasa al que no está haciendo nada.\n\nLo que quiero saber es dónde se cayeron. ¿Fue después de dos mensajes o veníamos hablando hace días? Son dos problemas distintos y se arreglan distinto.',
    created_at: '2026-08-01T12:00:30Z',
  },
];

export function Coach() {
  const [mensajes, setMensajes] = useState<MensajeCoach[]>([]);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [borrador, setBorrador] = useState('');
  const [cargando, setCargando] = useState(true);
  const [escribiendo, setEscribiendo] = useState(false);
  const [parcial, setParcial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sinCupo, setSinCupo] = useState(false);
  const hilo = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('dev') === '1') {
      setMensajes(MENSAJES_QA);
      setRestantes(8);
      setCargando(false);
      return;
    }
    void (async () => {
      const token = await getAccessToken();
      if (!token) {
        setError('Tu sesión se interrumpió. Recarga la página.');
        setCargando(false);
        return;
      }
      try {
        const estado = await estadoCoach(token);
        setMensajes(estado.mensajes);
        setRestantes(estado.restantes);
      } catch {
        setError('No pudimos abrir la conversación.');
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  /* El hilo se mantiene abajo mientras el coach escribe. */
  useEffect(() => {
    const el = hilo.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, parcial]);

  const enviar = useCallback(
    async (texto: string) => {
      const limpio = texto.trim();
      if (limpio === '' || escribiendo) return;

      setError(null);
      setBorrador('');
      setEscribiendo(true);
      setParcial('');
      // Optimista: el mensaje propio aparece al instante, sin esperar al servidor.
      const provisorio: MensajeCoach = {
        id: `local-${Date.now()}`,
        rol: 'user',
        texto: limpio,
        created_at: new Date().toISOString(),
      };
      setMensajes((prev) => [...prev, provisorio]);

      const token = await getAccessToken();
      if (!token) {
        setError('Tu sesión se interrumpió. Recarga la página.');
        setEscribiendo(false);
        return;
      }

      let acumulado = '';
      try {
        await enviarAlCoach(token, limpio, (pedazo) => {
          acumulado += pedazo;
          setParcial(acumulado);
        });
        setMensajes((prev) => [
          ...prev,
          {
            id: `coach-${Date.now()}`,
            rol: 'coach',
            texto: acumulado,
            created_at: new Date().toISOString(),
          },
        ]);
        setRestantes((r) => (r === null ? null : Math.max(0, r - 1)));
      } catch (err) {
        if (err instanceof ApiError && err.code === 'coach_quota') {
          setSinCupo(true);
          setMensajes((prev) => prev.filter((m) => m.id !== provisorio.id));
        } else {
          // Lo que alcanzó a decir vale: se queda en el hilo en vez de desaparecer.
          if (acumulado !== '') {
            setMensajes((prev) => [
              ...prev,
              {
                id: `coach-${Date.now()}`,
                rol: 'coach',
                texto: acumulado,
                created_at: new Date().toISOString(),
              },
            ]);
          }
          setError(err instanceof ApiError ? err.message : 'Se cortó la respuesta.');
        }
      } finally {
        setParcial('');
        setEscribiendo(false);
        campo.current?.focus();
      }
    },
    [escribiendo],
  );

  const vacio = mensajes.length === 0 && !cargando;

  return (
    <div className="dmx-coach">
      <header className="chead">
        <p className="kicker"><i />Tu coach</p>
        <h1 className="display">Hablemos.</h1>
        <p className="hint">
          Por qué te está yendo como te está yendo. Sin consuelo: aquí se lee el mercado, se decide
          si insistes o sueltas, y sales con algo concreto para hacer.
        </p>
        {restantes !== null && !sinCupo && (
          <div className="cupo">
            <span className="selloe s-mute">{restantes} mensajes libres</span>
          </div>
        )}
      </header>

      <div className="hilo" ref={hilo}>
        {cargando && <div className="loading-row"><span className="dot" />ABRIENDO…</div>}

        {vacio && (
          <div className="arranque">
            <p className="lead">Elige uno, o escribe lo tuyo.</p>
            <div className="sugerencias">
              {ARRANQUES.map((s) => (
                <button key={s} type="button" className="sug" onClick={() => void enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m) => (
          <div key={m.id} className={`turno ${m.rol}`}>
            {m.rol === 'coach' && <span className="quien">Coach</span>}
            <div className="burbuja">
              {m.texto.split('\n').map((linea, i) => (
                <p key={i}>{linea || ' '}</p>
              ))}
            </div>
          </div>
        ))}

        {escribiendo && (
          <div className="turno coach">
            <span className="quien">Coach</span>
            <div className="burbuja">
              {parcial === '' ? (
                <p className="pensando"><i /><i /><i /></p>
              ) : (
                <>
                  {parcial.split('\n').map((linea, i) => (
                    <p key={i}>{linea || ' '}</p>
                  ))}
                  <span className="cursor" />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {sinCupo ? (
        <div className="tope">
          <p className="lead">Hasta aquí llega el coach en el plan gratuito.</p>
          <p className="micro">Con el Copiloto la conversación no tiene tope.</p>
          <a className="btn" href="/app">Ver los planes</a>
        </div>
      ) : (
        <form
          className="compositor"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(borrador);
          }}
        >
          <textarea
            ref={campo}
            className="campo-coach"
            rows={1}
            maxLength={2000}
            placeholder="Escribe lo que te está pasando"
            value={borrador}
            disabled={escribiendo || cargando}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              // Enter manda, Shift+Enter hace salto de línea.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void enviar(borrador);
              }
            }}
          />
          <button className="btn enviar" type="submit" disabled={escribiendo || borrador.trim() === ''}>
            {escribiendo ? '…' : 'Enviar'}
          </button>
        </form>
      )}

      {error && <p className="err-general">{error}</p>}
    </div>
  );
}

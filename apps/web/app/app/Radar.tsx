'use client';

/**
 * RADAR - pensado para usarse con el pulgar sobre el botón de like.
 *
 * Una sola pieza: subir, un botón, resultado abajo. Sin pasos, sin scroll para
 * encontrar la respuesta, sin animación de entrada. Quien abre esto tiene la app
 * de citas abierta en la otra mano.
 *
 * La estimación se declara rápida en la cara, no en letra chica: esa fricción
 * declarada es lo que convierte al análisis completo.
 */

import { useCallback, useRef, useState } from 'react';
import type { AnalisisRechazado, RadarRead } from '@percentil/contracts';
import { ApiError, dispararRadar } from '../../lib/api';
import { prepararFoto } from '../../lib/imagen';
import { getAccessToken } from '../../lib/supabase';
import { evento } from '../../lib/analitica';

type Estado =
  | { t: 'listo' }
  | { t: 'midiendo' }
  | { t: 'resultado'; radar: RadarRead }
  | { t: 'rechazado'; rechazo: AnalisisRechazado }
  | { t: 'limite' };

const MAX = 4;

const VEREDICTOS: Record<string, { label: string; clase: string }> = {
  perseguir: { label: 'Vale', clase: 'v-ok' },
  oportunista: { label: 'Hay grieta', clase: 'v-medio' },
  volumen_bajo_esfuerzo: { label: 'Bajo esfuerzo', clase: 'v-medio' },
  no_vale: { label: 'No vale', clase: 'v-mal' },
};

const NIVEL: Record<string, string> = { muy_baja: 'Muy baja', baja: 'Baja', media: 'Media', alta: 'Alta' };

export function Radar() {
  const [estado, setEstado] = useState<Estado>({ t: 'listo' });
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function agregar(lista: FileList | null) {
    if (!lista) return;
    setArchivos((cur) => [...cur, ...[...lista].filter((f) => f.type.startsWith('image/'))].slice(0, MAX));
  }

  const disparar = useCallback(async () => {
    if (archivos.length === 0) return;
    setError(null);
    setEstado({ t: 'midiendo' });

    const token = await getAccessToken();
    if (!token) {
      setError('Tu sesión se interrumpió. Recarga la página.');
      setEstado({ t: 'listo' });
      return;
    }
    try {
      const form = new FormData();
      for (const f of archivos) form.append('photos', await prepararFoto(f), f.name);
      const salida = await dispararRadar(token, form);
      if (salida.ok) evento('radar_usado', { veredicto: salida.datos.veredicto });
      setEstado(salida.ok ? { t: 'resultado', radar: salida.datos } : { t: 'rechazado', rechazo: salida.rechazo });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'limit_reached') {
        evento('limite_alcanzado', { funcion: 'radar' });
        setEstado({ t: 'limite' });
        return;
      }
      setError(err instanceof ApiError ? err.message : 'No pudimos leerlo. Probá de nuevo.');
      setEstado({ t: 'listo' });
    }
  }, [archivos]);

  function reiniciar() {
    setArchivos([]);
    setError(null);
    setEstado({ t: 'listo' });
  }

  if (estado.t === 'limite') {
    return (
      <div className="dmx-radar">
        <div className="rechazo">
          <span className="selloe">Sin radares</span>
          <h1 className="display">Se te acabaron<br />los radares.</h1>
          <p>Con el Copiloto tenés radar todo el mes, antes de gastar un like.</p>
          <a className="btn" href="/app">Ver los planes</a>
        </div>
      </div>
    );
  }

  if (estado.t === 'rechazado') {
    return (
      <div className="dmx-radar">
        <div className="rechazo">
          <span className="selloe">Sin análisis</span>
          <h1 className="display">
            {estado.rechazo.motivo === 'menor_aparente' ? 'No analizamos esto.' : 'No se puede leer.'}
          </h1>
          <p>
            {estado.rechazo.motivo === 'menor_aparente'
              ? 'Hay señales de que la persona podría ser menor de edad. Ante la duda no puntuamos.'
              : 'Las capturas no alcanzan para juzgar nada. Probá con otras.'}
          </p>
          <p className="micro">No gastaste radar.</p>
          <button className="btn" onClick={reiniciar}>Probar con otro</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dmx-radar">
      <header className="chead">
        <p className="kicker"><i />Antes de dar like</p>
        <h1 className="display">Radar.</h1>
        <p className="hint">Subí una captura del perfil de ella y en segundos sabés si vale el like o seguís swipeando.</p>
      </header>

      {estado.t !== 'resultado' && (
        <>
          <div
            className="zona"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); agregar(e.dataTransfer.files); }}
          >
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => agregar(e.target.files)}
            />
            {archivos.length === 0 ? (
              <>
                <h3>Capturas del perfil de ella</h3>
                <p>Tocá acá o arrastralas. Hasta {MAX}; con una alcanza.</p>
              </>
            ) : (
              <div className="miniaturas">
                {archivos.map((f, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={`${f.name}-${i}`} src={URL.createObjectURL(f)} alt="" />
                ))}
              </div>
            )}
          </div>

          {error && <p className="err-general">{error}</p>}

          <div className="accion">
            <button className="btn" disabled={archivos.length === 0 || estado.t === 'midiendo'} onClick={() => void disparar()}>
              {estado.t === 'midiendo' ? 'Midiendo…' : 'Pasar el radar'}
            </button>
            {archivos.length > 0 && estado.t !== 'midiendo' && (
              <button className="btn btn-ghost" onClick={reiniciar}>Vaciar</button>
            )}
          </div>

          {/* La página no puede ser solo una caja de subir: muestra cómo se
              usa y cómo se ve lo que devuelve, antes de pedir nada. */}
          {archivos.length === 0 && (
            <>
              <ol className="pasos">
                <li>
                  <span className="pnum">1</span>
                  <div><b>Capturá su perfil</b><span>Screenshot en la app, como siempre hacés</span></div>
                </li>
                <li>
                  <span className="pnum">2</span>
                  <div><b>Tirala acá</b><span>Hasta {MAX} capturas, el orden da igual</span></div>
                </li>
                <li>
                  <span className="pnum">3</span>
                  <div><b>Veredicto en segundos</b><span>Like o seguí de largo, con el porqué</span></div>
                </li>
              </ol>

              <div className="golpe v-ok ejemplo" aria-label="Ejemplo de veredicto">
                <span className="selloe s-mute sello-ej">Así se ve · ejemplo</span>
                <div className="vlabel">Dale like.</div>
                <div className="cifras">
                  <div className="cifra"><b>62</b><small>ella</small></div>
                  <div className="cifra"><b>57</b><small>vos</small></div>
                  <div className="cifra gap"><b>−5</b><small>gap</small></div>
                </div>
                <p className="lectura">Está un escalón arriba pero el gap es corto: con tu mejor foto de apertura, jugable.</p>
              </div>

              <a className="medite" href="/app/perfil">
                ¿Ya matchearon o querés el plan completo para abrirle? Eso es <b>Leer un perfil →</b>
              </a>
            </>
          )}
        </>
      )}

      {estado.t === 'resultado' && <Resultado radar={estado.radar} onOtro={reiniciar} />}
    </div>
  );
}

function Resultado(props: { radar: RadarRead; onOtro: () => void }) {
  const r = props.radar;
  const ver = VEREDICTOS[r.veredicto] ?? VEREDICTOS.oportunista!;

  return (
    <div className="resultado">
      {r.alerta_autenticidad !== null && (
        <div className="alerta"><b>Cuidado</b><p>{r.alerta_autenticidad}</p></div>
      )}

      <div className={`golpe ${ver.clase}`}>
        <div className="vlabel">{ver.label}</div>
        <div className="cifras">
          <div className="cifra">
            <b>{r.indice.score}</b>
            <small>ella</small>
          </div>
          {r.gap_delta !== null && (
            <div className="cifra gap">
              <b>{r.gap_delta > 0 ? `+${r.gap_delta}` : r.gap_delta}</b>
              <small>de distancia</small>
            </div>
          )}
          <div className="cifra">
            <b>{NIVEL[r.probabilidad_respuesta.nivel] ?? r.probabilidad_respuesta.nivel}</b>
            <small>tu chance</small>
          </div>
        </div>
        <p className="lectura">{r.indice.lectura}</p>
      </div>

      {r.gap_delta === null && (
        <a className="medite" href="/app">
          No sabemos cuánto te separa de ella. <b>Medí tu perfil</b> y el radar te lo dice.
        </a>
      )}

      <div className="openers">
        {r.openers.map((o) => (
          <div className="opener" key={o.texto}>
            <div className="otop">
              <span className="otono">{o.tono.replace('_', ' ')}</span>
              <span className={`oriesgo r-${o.riesgo}`}>{o.riesgo}</span>
            </div>
            <p className="otexto">{o.texto}</p>
            <button
              className="copiar"
              onClick={() => void navigator.clipboard?.writeText(o.texto)}
            >
              Copiar
            </button>
          </div>
        ))}
      </div>

      <p className="rapida">
        Estimación rápida en {(r.ms_motor / 1000).toFixed(1)}s.{' '}
        <a href="/app/perfil">El análisis completo</a> lee su bio, su selectividad y te da el veredicto de inversión.
      </p>

      <button className="btn btn-ghost" onClick={props.onOtro}>Pasar otro</button>
    </div>
  );
}

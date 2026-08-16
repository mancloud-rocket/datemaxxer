'use client';

/**
 * COMPARADOR - su mejor foto contra la de ella.
 *
 * La función más compartible del producto y la que más rápido se puede volver un
 * juguete inútil. Lo que la salva es la descomposición: el gap partido en puntos
 * que él cierra y puntos que son rasgos, con el plan y los plazos.
 *
 * Por eso la jerarquía visual es: el veredicto, después la barra partida en
 * cerrable/no cerrable, y recién después el plan. Un número solo deprime; un
 * número con "nueve de esos veinticuatro los cerrás en seis semanas y así" es un
 * argumento de venta.
 */

import { useCallback, useRef, useState } from 'react';
import type { AnalisisRechazado, CompareResult } from '@percentil/contracts';
import { ApiError, compararPerfiles } from '../../lib/api';
import { prepararFoto } from '../../lib/imagen';
import { getAccessToken } from '../../lib/supabase';
import { evento } from '../../lib/analitica';

type Estado =
  | { t: 'subir' }
  | { t: 'comparando' }
  | { t: 'resultado'; r: CompareResult }
  | { t: 'rechazado'; rechazo: AnalisisRechazado }
  | { t: 'limite' };

const PLAZOS: Record<string, string> = {
  hoy: 'hoy',
  semana: 'esta semana',
  mes: 'este mes',
  trimestre: '3 meses',
  año: 'un año',
};

/**
 * Cada ranura dice adentro QUÉ foto espera. Antes el único cartel era un
 * mono de 8.6px debajo del hueco, y no se entendía cuál era cuál.
 */
function Ranura(props: {
  titulo: string;
  detalle: string;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`ranura${drag ? ' drag' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); props.onPick(e.dataTransfer.files?.[0] ?? null); }}
    >
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => props.onPick(e.target.files?.[0] ?? null)}
      />
      {props.file ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={URL.createObjectURL(props.file)} alt={props.titulo} />
      ) : (
        <div className="hueco">
          <span className="mas">+</span>
          <b>{props.titulo}</b>
          <p>{props.detalle}</p>
        </div>
      )}
      <small>{props.file ? 'Tocá para cambiarla' : 'Tocá o arrastrá la imagen'}</small>
    </div>
  );
}

export function Comparador() {
  const [estado, setEstado] = useState<Estado>({ t: 'subir' });
  const [mia, setMia] = useState<File | null>(null);
  const [suya, setSuya] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const comparar = useCallback(async () => {
    if (!mia || !suya) return;
    setError(null);
    setEstado({ t: 'comparando' });

    const token = await getAccessToken();
    if (!token) {
      setError('Tu sesión se interrumpió. Recarga la página.');
      setEstado({ t: 'subir' });
      return;
    }
    try {
      const form = new FormData();
      form.append('usuario', await prepararFoto(mia), mia.name);
      form.append('objetivo', await prepararFoto(suya), suya.name);
      const salida = await compararPerfiles(token, form);
      if (salida.ok) evento('comparacion_hecha', { delta: salida.datos.gap.delta });
      setEstado(salida.ok ? { t: 'resultado', r: salida.datos } : { t: 'rechazado', rechazo: salida.rechazo });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'limit_reached') {
        setEstado({ t: 'limite' });
        return;
      }
      setError(err instanceof ApiError ? err.message : 'No pudimos compararlas.');
      setEstado({ t: 'subir' });
    }
  }, [mia, suya]);

  function reiniciar() {
    setMia(null);
    setSuya(null);
    setError(null);
    setEstado({ t: 'subir' });
  }

  if (estado.t === 'limite' || estado.t === 'rechazado') {
    const esLimite = estado.t === 'limite';
    return (
      <div className="dmx-comparador">
        <div className="rechazo">
          <span className="selloe">{esLimite ? 'Sin comparaciones' : 'Sin análisis'}</span>
          <h1 className="display">
            {esLimite ? 'Se te acabaron.' : 'No analizamos estas fotos.'}
          </h1>
          <p>
            {esLimite
              ? 'Con el Copiloto podés comparar todo el mes.'
              : estado.rechazo.motivo === 'menor_aparente'
                ? 'Hay señales de que alguna de las dos personas podría ser menor de edad. Ante la duda no puntuamos.'
                : 'Alguna de las dos fotos no permite juzgar nada. Probá con otras.'}
          </p>
          {esLimite ? (
            <a className="btn" href="/app">Ver los planes</a>
          ) : (
            <button className="btn" onClick={reiniciar}>Probar con otras</button>
          )}
        </div>
      </div>
    );
  }

  if (estado.t === 'resultado') return <Resultado r={estado.r} onOtra={reiniciar} />;

  return (
    <div className="dmx-comparador">
      <header className="chead">
        <p className="kicker"><i />Lado a lado</p>
        <h1 className="display">¿Cuánto te<br />separa de ella?</h1>
        <p className="hint">
          Tu mejor foto contra la de ella. Te decimos cuántos puntos los separan y,
          de esos, cuántos podés recuperar vos.
        </p>
      </header>

      <div className="ranuras">
        <Ranura
          titulo="Tu mejor foto"
          detalle="Con la que abrís tu perfil"
          file={mia}
          onPick={setMia}
        />
        <span className="versus">vs</span>
        <Ranura
          titulo="La foto de ella"
          detalle="Una captura clara de su perfil"
          file={suya}
          onPick={setSuya}
        />
      </div>

      {error && <p className="err-general">{error}</p>}

      <div className="accion">
        <button className="btn" disabled={!mia || !suya || estado.t === 'comparando'} onClick={() => void comparar()}>
          {estado.t === 'comparando' ? 'Comparando…' : 'Comparar'}
        </button>
      </div>
    </div>
  );
}

function Resultado(props: { r: CompareResult; onOtra: () => void }) {
  const { r } = props;
  const delta = r.gap.delta;
  const total = Math.max(Math.abs(delta), 1);
  const pctCerrable = Math.round((r.descomposicion.cerrables / total) * 100);

  return (
    <div className="dmx-comparador">
      <div className="marcador">
        <div className="lado">
          <b>{r.usuario.global}</b>
          <small>vos</small>
        </div>
        <div className="delta">{delta > 0 ? `−${delta}` : delta < 0 ? `+${Math.abs(delta)}` : '='}</div>
        <div className="lado">
          <b>{r.objetivo.global}</b>
          <small>ella</small>
        </div>
      </div>

      <p className="veredicto">{r.veredicto}</p>

      {delta > 0 && (
        <div className="reparto">
          <div className="barra">
            <i className="cerrable" style={{ width: `${pctCerrable}%` }} />
            <i className="fijo" style={{ width: `${100 - pctCerrable}%` }} />
          </div>
          <div className="leyenda">
            <span className="l-cerrable"><b>{r.descomposicion.cerrables}</b> los cerrás vos</span>
            <span className="l-fijo"><b>{r.descomposicion.no_cerrables}</b> son rasgos</span>
          </div>
        </div>
      )}

      <section className="panel">
        <div className="plabel">El plan · qué mueve tu número</div>
        <div className="plan">
          {r.descomposicion.plan.map((p) => (
            <div className="paso" key={p.accion}>
              <span className="puntos">+{p.puntos}</span>
              <div className="qué">
                <b>{p.accion}</b>
                <small>{PLAZOS[p.plazo] ?? p.plazo}</small>
              </div>
            </div>
          ))}
        </div>
        <p className="techo">
          Si hacés todo: <b>{r.techo_estimado}</b>. Ese es tu techo real con estas fotos,
          no una promesa de otra cara.
        </p>
      </section>

      <section className="panel caras">
        <div className="cara">
          <div className="plabel">Vos</div>
          <p className="gana">{r.usuario.fortaleza}</p>
          <p className="pierde">{r.usuario.debilidad}</p>
        </div>
        <div className="cara">
          <div className="plabel">Ella</div>
          <p className="gana">{r.objetivo.fortaleza}</p>
          <p className="pierde">{r.objetivo.debilidad}</p>
        </div>
      </section>

      <div className="accion">
        {delta > 0 && <Compartir delta={delta} cerrables={r.descomposicion.cerrables} />}
        <button className="btn btn-ghost" onClick={props.onOtra}>Comparar otra</button>
      </div>
    </div>
  );
}

/**
 * La card se comparte por URL con los números adentro: no se guarda nada y no
 * lleva ninguna referencia a la otra persona, solo la distancia y cuánto es
 * recuperable.
 */
function Compartir(props: { delta: number; cerrables: number }) {
  const [copiado, setCopiado] = useState(false);

  async function compartir() {
    evento('card_compartida', { delta: props.delta });
    const url = `${window.location.origin}/gap?d=${props.delta}&c=${props.cerrables}`;
    const texto = `${props.cerrables} de esos ${props.delta} puntos los recupero yo.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Datemaxxer', text: texto, url });
        return;
      } catch {
        /* si cancela el diálogo nativo, cae al copiado */
      }
    }
    await navigator.clipboard?.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2200);
  }

  return (
    <button className="btn" onClick={() => void compartir()}>
      {copiado ? 'Link copiado' : 'Compartir'}
    </button>
  );
}

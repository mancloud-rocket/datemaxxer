'use client';

/**
 * F2 - Estudio de fotos.
 *
 * La pieza con peso es la comparación antes/después con un divisor arrastrable:
 * es lo único que le prueba al usuario que la corrección hizo algo y que no le
 * cambiamos la cara. Ver las dos imágenes superpuestas y correr la línea es más
 * honesto que dos miniaturas al lado, donde cualquiera puede disimular.
 *
 * Los ajustes se aplican con debounce: cada uno es una request con la imagen
 * completa, así que mover un slider no puede disparar veinte llamadas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Arquetipo } from '@percentil/contracts';
import { ApiError, retocarFoto, type FotoRetocada } from '../../lib/api';
import { getAccessToken } from '../../lib/supabase';

const ARQUETIPOS: Array<{ v: Arquetipo | ''; label: string }> = [
  { v: '', label: 'sin color' },
  { v: 'viajero', label: 'viajero' },
  { v: 'outdoor', label: 'outdoor' },
  { v: 'deportista', label: 'deportista' },
  { v: 'profesional', label: 'profesional' },
  { v: 'intelectual', label: 'intelectual' },
  { v: 'creativo', label: 'creativo' },
  { v: 'social', label: 'social' },
  { v: 'hogareno', label: 'hogareño' },
];

interface Ajustes {
  exposicion: number;
  contraste: number;
  enderezar: number;
  arquetipo: Arquetipo | '';
  balanceBlancos: boolean;
  ruido: boolean;
  nitidez: boolean;
}

const INICIAL: Ajustes = {
  exposicion: 0,
  contraste: 0,
  enderezar: 0,
  arquetipo: '',
  balanceBlancos: false,
  ruido: false,
  nitidez: false,
};

export function Fotos() {
  const [original, setOriginal] = useState<File | null>(null);
  const [urlOriginal, setUrlOriginal] = useState<string | null>(null);
  const [ajustes, setAjustes] = useState<Ajustes>(INICIAL);
  const [resultado, setResultado] = useState<FotoRetocada | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinPlan, setSinPlan] = useState(false);
  const [divisor, setDivisor] = useState(50);
  const input = useRef<HTMLInputElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const ultimaUrl = useRef<string | null>(null);

  /* Los object URL se revocan a mano: si no, cada ajuste deja un blob colgado. */
  useEffect(() => {
    return () => {
      if (ultimaUrl.current) URL.revokeObjectURL(ultimaUrl.current);
    };
  }, []);

  const aplicar = useCallback(async (file: File, a: Ajustes) => {
    setProcesando(true);
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setError('Tu sesión se interrumpió. Recarga la página.');
      setProcesando(false);
      return;
    }
    try {
      const form = new FormData();
      form.append('foto', file, file.name);
      if (a.exposicion !== 0) form.append('exposicion', String(a.exposicion));
      if (a.contraste !== 0) form.append('contraste', String(a.contraste));
      if (a.enderezar !== 0) form.append('enderezar', String(a.enderezar));
      if (a.arquetipo !== '') form.append('arquetipo', a.arquetipo);
      if (a.balanceBlancos) form.append('balanceBlancos', 'true');
      if (a.ruido) form.append('ruido', 'true');
      if (a.nitidez) form.append('nitidez', 'true');

      const salida = await retocarFoto(token, form);
      if (ultimaUrl.current) URL.revokeObjectURL(ultimaUrl.current);
      ultimaUrl.current = salida.url;
      setResultado(salida);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'plan_requerido') setSinPlan(true);
      else setError(err instanceof ApiError ? err.message : 'No pudimos procesar la foto.');
    } finally {
      setProcesando(false);
    }
  }, []);

  /* Debounce: mover un slider no puede disparar veinte requests con la imagen entera. */
  useEffect(() => {
    if (!original) return;
    const t = setTimeout(() => void aplicar(original, ajustes), 700);
    return () => clearTimeout(t);
  }, [original, ajustes, aplicar]);

  function elegir(file: File | null) {
    if (!file) return;
    if (urlOriginal) URL.revokeObjectURL(urlOriginal);
    setOriginal(file);
    setUrlOriginal(URL.createObjectURL(file));
    setAjustes(INICIAL);
    setResultado(null);
  }

  function arrastrar(clientX: number) {
    const caja = marco.current?.getBoundingClientRect();
    if (!caja) return;
    setDivisor(Math.max(0, Math.min(100, ((clientX - caja.left) / caja.width) * 100)));
  }

  if (sinPlan) {
    return (
      <div className="dmx-fotos">
        <div className="rechazo">
          <span className="selloe">Viene con el Kit</span>
          <h1 className="display">El estudio<br />de fotos.</h1>
          <p>
            Corrección técnica y color según tu arquetipo. Nunca tocamos tu cara ni tu
            cuerpo: eso está prohibido en el código, no en la política.
          </p>
          <a className="btn" href="/app">Ver los planes</a>
        </div>
      </div>
    );
  }

  return (
    <div className="dmx-fotos">
      <header className="chead">
        <p className="kicker"><i />Estudio de fotos</p>
        <h1 className="display">La misma foto,<br />bien revelada.</h1>
        <p className="hint">
          Luz, color y encuadre. <b>No te cambiamos la cara ni el cuerpo</b>: warp, liquify y
          suavizado de piel no existen en este código.
        </p>
      </header>

      {!original ? (
        <div className="zona" onClick={() => input.current?.click()}>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => elegir(e.target.files?.[0] ?? null)}
          />
          <h3>Subí una foto</h3>
          <p>Una a la vez. La que quieras poner de apertura.</p>
        </div>
      ) : (
        <>
          <div
            className="comparador"
            ref={marco}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); arrastrar(e.clientX); }}
            onPointerMove={(e) => { if (e.buttons === 1) arrastrar(e.clientX); }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="base" src={resultado?.url ?? urlOriginal!} alt="" />
            <div className="tapa" style={{ width: `${divisor}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlOriginal!} alt="" />
            </div>
            <div className="linea" style={{ left: `${divisor}%` }}><span /></div>
            <span className="etq izq">antes</span>
            <span className="etq der">después</span>
            {procesando && <span className="trabajando">procesando…</span>}
          </div>

          <section className="controles">
            <Deslizador
              label="Exposición"
              valor={ajustes.exposicion}
              min={-2}
              max={2}
              paso={0.1}
              onChange={(v) => setAjustes((a) => ({ ...a, exposicion: v }))}
            />
            <Deslizador
              label="Contraste"
              valor={ajustes.contraste}
              min={-0.4}
              max={0.4}
              paso={0.05}
              onChange={(v) => setAjustes((a) => ({ ...a, contraste: v }))}
            />
            <Deslizador
              label="Enderezar"
              valor={ajustes.enderezar}
              min={-8}
              max={8}
              paso={0.5}
              sufijo="°"
              onChange={(v) => setAjustes((a) => ({ ...a, enderezar: v }))}
            />

            <div className="grupo">
              <span className="glabel">Color por arquetipo</span>
              <div className="chips">
                {ARQUETIPOS.map((a) => (
                  <button
                    key={a.v || 'ninguno'}
                    type="button"
                    className={`chip${ajustes.arquetipo === a.v ? ' on' : ''}`}
                    onClick={() => setAjustes((cur) => ({ ...cur, arquetipo: a.v }))}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grupo">
              <span className="glabel">Correcciones</span>
              <div className="chips">
                {([
                  ['balanceBlancos', 'balance de blancos'],
                  ['ruido', 'quitar ruido'],
                  ['nitidez', 'nitidez'],
                ] as const).map(([clave, label]) => (
                  <button
                    key={clave}
                    type="button"
                    className={`chip${ajustes[clave] ? ' on' : ''}`}
                    onClick={() => setAjustes((cur) => ({ ...cur, [clave]: !cur[clave] }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {error && <p className="err-general">{error}</p>}

          <div className="accion">
            {resultado && (
              <a className="btn" href={resultado.url} download="datemaxxer.jpg">Descargar</a>
            )}
            <button className="btn btn-ghost" onClick={() => setAjustes(INICIAL)}>Volver al original</button>
            <button className="btn btn-ghost" onClick={() => { setOriginal(null); setResultado(null); }}>
              Otra foto
            </button>
          </div>

          {resultado && (
            <p className="declaracion">
              Se aplicó: <b>{resultado.aplicadas.length > 0 ? resultado.aplicadas.join(', ') : 'nada todavía'}</b>.
              <br />
              Nunca se aplica: {resultado.prohibidas.join(', ')}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Deslizador(props: {
  label: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  sufijo?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="desliza">
      <span className="dlabel">
        {props.label}
        <b>{props.valor > 0 ? '+' : ''}{props.valor}{props.sufijo ?? ''}</b>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.paso}
        value={props.valor}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

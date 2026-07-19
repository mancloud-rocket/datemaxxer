'use client';

/**
 * Pantallas simples de /app: login, mesa y límite.
 * Piel base con las clases de app.css (btn/campo/selloe/estado-box); el arte
 * final de mesa e ingreso lo debe FRONT (SET-PIECES.md pendientes 3 y 4).
 * Escáner e informe viven en Escaner.tsx / Informe.tsx (set pieces porteados).
 */

import { useRef, useState } from 'react';
import { Arquetipo, Region } from '@percentil/contracts';
import { getSupabase } from '../../lib/supabase';

export function PantallaLogin() {
  const [paso, setPaso] = useState<'idle' | 'codigo'>('idle');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function google() {
    setError(null);
    const { error: err } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (err) setError(err.message);
  }

  async function mandarCodigo() {
    setCargando(true);
    setError(null);
    const { error: err } = await getSupabase().auth.signInWithOtp({ email });
    setCargando(false);
    if (err) setError('No pudimos mandar el código. Revisá el mail e intentá de nuevo.');
    else setPaso('codigo');
  }

  async function verificar() {
    setCargando(true);
    setError(null);
    const { error: err } = await getSupabase().auth.verifyOtp({ email, token: codigo, type: 'email' });
    setCargando(false);
    if (err) setError('Código inválido o vencido.');
    // si es válido, onAuthStateChange del shell toma la sesión
  }

  return (
    <div className="dmx-simple">
      <section style={{ maxWidth: 380, margin: '0 auto', textAlign: 'center', width: '100%' }}>
        <span className="selloe">Expediente personal</span>
        <h1 className="display" style={{ fontSize: 'clamp(1.7rem,6vw,2.4rem)', margin: '1.1rem 0 2rem' }}>
          Abrí tu<br />expediente
        </h1>
        <button className="btn" onClick={() => void google()}>Continuar con Google</button>
        <p className="mono" style={{ color: 'var(--steel)', margin: '1.6rem 0', fontSize: '.62rem' }}>o con tu email</p>
        {paso === 'idle' ? (
          <div style={{ display: 'grid', gap: '.8rem' }}>
            <input
              className="campo"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn-ghost" disabled={cargando || !email.includes('@')} onClick={() => void mandarCodigo()}>
              {cargando ? 'Mandando…' : 'Mandarme un código'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '.8rem' }}>
            <p style={{ color: 'var(--ink-mute)' }}>Te mandamos un código a {email}</p>
            <input
              className="campo"
              style={{ textAlign: 'center', letterSpacing: '.4em' }}
              inputMode="numeric"
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
            <button className="btn" disabled={cargando || codigo.length < 6} onClick={() => void verificar()}>
              {cargando ? 'Verificando…' : 'Entrar'}
            </button>
          </div>
        )}
        {error && <p style={{ color: 'var(--oxide)', marginTop: '1rem' }}>{error}</p>}
      </section>
    </div>
  );
}

const REGIONES = Region.options;
const ARQUETIPOS = Arquetipo.options;

export function PantallaMesa(props: {
  error: string | null;
  enviando: boolean;
  onEnviar: (form: FormData) => void;
}) {
  const [fotos, setFotos] = useState<File[]>([]);
  const [bio, setBio] = useState('');
  const [region, setRegion] = useState('rioplatense');
  const [objetivo, setObjetivo] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function agregar(list: FileList | null) {
    if (!list) return;
    setErrorLocal(null);
    const nuevas = [...fotos];
    for (const f of Array.from(list)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
        setErrorLocal(`${f.name}: solo jpg, png o webp`);
        continue;
      }
      if (f.size > 8 * 1024 * 1024) {
        setErrorLocal(`${f.name}: máximo 8MB`);
        continue;
      }
      if (nuevas.length < 9) nuevas.push(f);
    }
    setFotos(nuevas);
  }

  function enviar() {
    if (fotos.length < 4) {
      setErrorLocal('Subí al menos 4 fotos (tu perfil real).');
      return;
    }
    const form = new FormData();
    for (const f of fotos) form.append('photos', f);
    form.append('bio', bio);
    form.append('region', region);
    if (objetivo) form.append('arquetipo_objetivo', objetivo);
    props.onEnviar(form);
  }

  const error = props.error ?? errorLocal;

  return (
    <div className="dmx-simple">
      <section style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}>
        <span className="selloe">Mesa de evidencia</span>
        <h1 className="display" style={{ fontSize: 'clamp(1.7rem,6vw,2.4rem)', margin: '1rem 0 1.4rem' }}>
          Subí tu perfil
        </h1>
        <div
          style={{ border: '1.5px dashed var(--line)', borderRadius: 10, padding: '1.4rem', cursor: 'pointer', background: 'rgba(23,27,34,.4)' }}
          onClick={() => inputRef.current?.click()}
        >
          <p className="mono" style={{ color: 'var(--steel)', fontSize: '.62rem' }}>
            {fotos.length === 0 ? 'FOTOS 01-09 · TOCÁ PARA CARGAR (4 A 9)' : `${fotos.length} FOTO(S) EN LA MESA`}
          </p>
          <input
            ref={inputRef}
            hidden
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => agregar(e.target.files)}
          />
          <ul style={{ listStyle: 'none', marginTop: fotos.length ? '.8rem' : 0 }}>
            {fotos.map((f, i) => (
              <li key={`${f.name}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '.25rem 0' }}>
                <span className="mono" style={{ color: 'var(--ink)', fontSize: '.62rem' }}>
                  FOTO {String(i + 1).padStart(2, '0')} · {f.name}
                </span>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--oxide)', cursor: 'pointer', fontFamily: 'inherit' }}
                  onClick={(e) => { e.stopPropagation(); setFotos(fotos.filter((_, j) => j !== i)); }}
                >
                  descartar
                </button>
              </li>
            ))}
          </ul>
        </div>
        <textarea
          className="campo"
          style={{ marginTop: '1rem', minHeight: 90 }}
          placeholder="Tu bio actual (opcional, la cruzamos contra las fotos)"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.8rem', marginTop: '1rem' }}>
          <label className="mono" style={{ color: 'var(--steel)', fontSize: '.62rem' }}>
            Región
            <select className="campo" style={{ marginTop: '.4rem' }} value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="mono" style={{ color: 'var(--steel)', fontSize: '.62rem' }}>
            Qué querés transmitir (opcional)
            <select className="campo" style={{ marginTop: '.4rem' }} value={objetivo} onChange={(e) => setObjetivo(e.target.value)}>
              <option value="">- sin objetivo -</option>
              {ARQUETIPOS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        </div>
        {error && <p style={{ color: 'var(--oxide)', marginTop: '1rem' }}>{error}</p>}
        <button className="btn" style={{ marginTop: '1.4rem' }} disabled={props.enviando} onClick={enviar}>
          {props.enviando ? 'Abriendo expediente…' : 'Auditar mi perfil'}
        </button>
      </section>
    </div>
  );
}

export function PantallaLimite() {
  return (
    <div className="estado-box">
      <span className="selloe">Cupo gratuito usado</span>
      <h1 className="display">Tu primera auditoría<br />ya está en el expediente.</h1>
      <p>
        La auditoría gratis es una sola por cuenta. Para volver a auditarte después de mejorar tu
        perfil, y desbloquear el plan completo de fotos, el Kit te cubre: incluye re-chequeo a los 30 días.
      </p>
      <div>
        <button className="btn">Pasar al Kit · US$ 19</button>
      </div>
    </div>
  );
}

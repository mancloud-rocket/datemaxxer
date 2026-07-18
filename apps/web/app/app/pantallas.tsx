'use client';

/**
 * Pantallas ESQUELETO de /app: estados y wiring completos, estilo mínimo con tokens.
 * La dirección de arte final la entrega FRONT (design/app/, ver AGENTS-LOG 18-jul f)
 * y se portea encima de estos componentes. No shipear esta piel a usuarios finales.
 */

import { useRef, useState } from 'react';
import { Arquetipo, Region } from '@percentil/contracts';
import type { AuditView } from '../../lib/api';
import { getSupabase } from '../../lib/supabase';

const mono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: '.22em',
  fontSize: '.7rem',
};

const boton: React.CSSProperties = {
  display: 'inline-block',
  background: 'var(--signal)',
  color: 'var(--void)',
  border: 'none',
  borderRadius: 4,
  padding: '1rem 2.2rem',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: '1rem',
};

const campo: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  color: 'var(--ink)',
  padding: '.8rem 1rem',
  fontSize: '1rem',
};

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
    <section style={{ maxWidth: 380, margin: '0 auto', textAlign: 'center' }}>
      <p style={{ ...mono, color: 'var(--ink-mute)' }}>Expediente personal</p>
      <h1 style={{ fontFamily: 'var(--font-display)', textTransform: 'uppercase', margin: '.6rem 0 2rem' }}>
        Abrí tu expediente
      </h1>
      <button style={boton} onClick={() => void google()}>
        Continuar con Google
      </button>
      <p style={{ ...mono, color: 'var(--steel)', margin: '1.6rem 0' }}>o con tu email</p>
      {paso === 'idle' ? (
        <div style={{ display: 'grid', gap: '.8rem' }}>
          <input
            style={campo}
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button style={{ ...boton, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)' }}
            disabled={cargando || !email.includes('@')}
            onClick={() => void mandarCodigo()}>
            {cargando ? 'Mandando…' : 'Mandarme un código'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '.8rem' }}>
          <p style={{ color: 'var(--ink-mute)' }}>Te mandamos un código a {email}</p>
          <input
            style={{ ...campo, textAlign: 'center', letterSpacing: '.4em' }}
            inputMode="numeric"
            placeholder="000000"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
          <button style={boton} disabled={cargando || codigo.length < 6} onClick={() => void verificar()}>
            {cargando ? 'Verificando…' : 'Entrar'}
          </button>
        </div>
      )}
      {error && <p style={{ color: 'var(--oxide)', marginTop: '1rem' }}>{error}</p>}
    </section>
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
    <section style={{ maxWidth: 560, margin: '0 auto' }}>
      <p style={{ ...mono, color: 'var(--ink-mute)' }}>Mesa de evidencia</p>
      <h1 style={{ fontFamily: 'var(--font-display)', textTransform: 'uppercase', margin: '.6rem 0 1.4rem' }}>
        Subí tu perfil
      </h1>
      <div
        style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '1.4rem', cursor: 'pointer' }}
        onClick={() => inputRef.current?.click()}
      >
        <p style={{ ...mono, color: 'var(--steel)' }}>
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
              <span style={{ ...mono, color: 'var(--ink)' }}>FOTO {String(i + 1).padStart(2, '0')} · {f.name}</span>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--oxide)', cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); setFotos(fotos.filter((_, j) => j !== i)); }}
              >
                descartar
              </button>
            </li>
          ))}
        </ul>
      </div>
      <textarea
        style={{ ...campo, marginTop: '1rem', minHeight: 90 }}
        placeholder="Tu bio actual (opcional, la cruzamos contra las fotos)"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.8rem', marginTop: '1rem' }}>
        <label style={{ ...mono, color: 'var(--steel)' }}>
          Región
          <select style={{ ...campo, marginTop: '.4rem' }} value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label style={{ ...mono, color: 'var(--steel)' }}>
          Qué querés transmitir (opcional)
          <select style={{ ...campo, marginTop: '.4rem' }} value={objetivo} onChange={(e) => setObjetivo(e.target.value)}>
            <option value="">— sin objetivo —</option>
            {ARQUETIPOS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>
      {error && <p style={{ color: 'var(--oxide)', marginTop: '1rem' }}>{error}</p>}
      <button style={{ ...boton, marginTop: '1.4rem' }} disabled={props.enviando} onClick={enviar}>
        {props.enviando ? 'Abriendo expediente…' : 'Auditar mi perfil'}
      </button>
    </section>
  );
}

export function PantallaEscaner(props: { view: AuditView }) {
  const { progress } = props.view;
  const analizando = progress.fotos_analizadas < progress.total;
  return (
    <section style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
      <p style={{ ...mono, color: 'var(--signal)' }}>
        {analizando
          ? `ANALIZANDO EVIDENCIA · ${progress.fotos_analizadas}/${progress.total}`
          : 'SINTETIZANDO VEREDICTO…'}
      </p>
      <div style={{ height: 2, background: 'var(--line)', margin: '2rem 0' }}>
        <div
          style={{
            height: '100%',
            width: analizando ? '35%' : '80%',
            background: 'var(--signal)',
            boxShadow: '0 0 10px rgba(79,217,194,.6)',
            transition: 'width 1.2s',
          }}
        />
      </div>
      <p style={{ color: 'var(--ink-mute)' }}>
        Leemos tu perfil como lo lee el algoritmo. Tarda menos de un minuto: no cierres esta pantalla.
      </p>
      <p style={{ ...mono, color: 'var(--steel)', marginTop: '2rem' }}>[ set piece del escáner: FRONT ]</p>
    </section>
  );
}

export function PantallaInforme(props: { view: AuditView }) {
  const [avisado, setAvisado] = useState(false);
  const r = props.view.result;
  if (!r) return null;
  const bloqueado: React.CSSProperties = {
    border: '1px dashed var(--line)',
    borderRadius: 8,
    padding: '1rem',
    color: 'var(--steel)',
    marginTop: '.8rem',
  };
  return (
    <section style={{ maxWidth: 560, margin: '0 auto' }}>
      <p style={{ ...mono, color: 'var(--ink-mute)' }}>Expediente 001 · Veredicto</p>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '3.4rem', margin: '.4rem 0' }}>
        {r.score_coherencia}<span style={{ fontSize: '1.4rem', color: 'var(--steel)' }}>/100</span>
      </h1>
      <p style={{ ...mono, color: 'var(--oxide)' }}>
        Arquetipo detectado: {r.arquetipo_detectado.nombre} ({Math.round(r.arquetipo_detectado.confianza * 100)}%)
      </p>
      <blockquote style={{ fontSize: '1.25rem', margin: '1.4rem 0', color: 'var(--ink)' }}>
        «{r.lectura_200ms}»
      </blockquote>
      <div style={bloqueado}>EVIDENCIA POR FOTO · {r.evidencia_por_foto.length} lecturas — BLOQUEADO</div>
      <div style={bloqueado}>PLAN DE FOTOS · conservar/reemplazar/orden + briefs — BLOQUEADO</div>
      <div style={bloqueado}>QUICK WINS · {r.quick_wins.length} acciones — BLOQUEADO</div>
      <div style={{ marginTop: '1.6rem' }}>
        {avisado ? (
          <p style={{ color: 'var(--signal)', fontWeight: 600 }}>Listo. Te avisamos cuando el Kit abra.</p>
        ) : (
          <button style={boton} onClick={() => setAvisado(true)}>
            Desbloquear con el Kit · US$ 19
          </button>
        )}
      </div>
    </section>
  );
}

export function PantallaLimite() {
  return (
    <section style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
      <p style={{ ...mono, color: 'var(--oxide)' }}>Cupo gratuito usado</p>
      <h1 style={{ fontFamily: 'var(--font-display)', textTransform: 'uppercase', margin: '.6rem 0 1rem' }}>
        Tu expediente ya existe
      </h1>
      <p style={{ color: 'var(--ink-mute)' }}>
        La auditoría gratuita es una por cuenta. La re-auditoría (con fotos nuevas) viene con el Kit.
      </p>
      <button style={{ ...boton, marginTop: '1.4rem' }}>Quiero el Kit · US$ 19</button>
    </section>
  );
}

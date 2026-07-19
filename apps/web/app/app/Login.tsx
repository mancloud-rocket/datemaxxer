'use client';

/**
 * EL INGRESO · set piece "la apertura del expediente" (porteo fiel de
 * design/app/ingreso.html). El sello vira de óxido a cyan y el candado se
 * abre con un check cyan dibujándose cuando la identidad queda verificada.
 * Auth REAL contra Supabase (Google OAuth + email OTP), no el código demo
 * del prototipo.
 */

import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { gsap, setDraw } from '../../lib/motion';

type Paso = 'metodo' | 'codigo';

export function Login() {
  const [paso, setPaso] = useState<Paso>('metodo');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpEstado, setOtpEstado] = useState<'idle' | 'bad' | 'good'>('idle');
  const [otpMsg, setOtpMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const sealRef = useRef<HTMLDivElement>(null);
  const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (paso === 'codigo') setTimeout(() => otpRefs.current[0]?.focus(), 300);
  }, [paso]);

  async function google() {
    setError(null);
    const { error: err } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (err) setError(err.message);
  }

  async function mandarCodigo() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      const input = document.getElementById('dmx-email');
      if (input && !REDUCED) gsap.fromTo(input, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1,.4)' });
      return;
    }
    setCargando(true);
    setError(null);
    const { error: err } = await getSupabase().auth.signInWithOtp({ email });
    setCargando(false);
    if (err) setError('No pudimos mandar el código. Revisá el mail e intentá de nuevo.');
    else setPaso('codigo');
  }

  function seal() {
    const el = sealRef.current;
    if (!el) return;
    if (REDUCED) {
      pintarSelloAbierto(el);
      return;
    }
    const tl = gsap.timeline();
    tl.to(el.querySelectorAll('#ringOut, #ringIn'), { stroke: '#4FD9C2', duration: 0.5 }, 0)
      .to(el.querySelector('#engrave'), { stroke: '#4FD9C2', duration: 0.5 }, 0)
      .to(el.querySelector('#selloSvg'), { rotate: 190, duration: 0.9, ease: 'power3.inOut', svgOrigin: '70 70' }, 0)
      .to(el.querySelector('#shackle'), { y: -6, rotate: 12, transformOrigin: 'right top', duration: 0.3, ease: 'back.out(2)' }, 0.25)
      .to(el.querySelector('#lockBody'), { opacity: 0, duration: 0.3 }, 0.5)
      .call(() => setDraw(el.querySelector('#check') as SVGPathElement), undefined, 0.55)
      .fromTo(el.querySelector('#check'), { opacity: 1 }, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out' }, 0.55)
      .to(el.querySelector('#emblema'), { scale: 1.12, duration: 0.2, ease: 'power2.out' }, 0.55)
      .to(el.querySelector('#emblema'), { scale: 1, duration: 0.3, ease: 'power2.inOut' }, 0.75);
  }

  function pintarSelloAbierto(el: HTMLElement) {
    gsap.set(el.querySelectorAll('#ringOut, #ringIn, #engrave'), { stroke: '#4FD9C2' });
    gsap.set(el.querySelector('#lockBody'), { opacity: 0 });
    gsap.set(el.querySelector('#check'), { opacity: 1, strokeDasharray: 40, strokeDashoffset: 0 });
  }

  async function verificar(codigo: string) {
    setCargando(true);
    setOtpMsg('');
    const { error: err } = await getSupabase().auth.verifyOtp({ email, token: codigo, type: 'email' });
    setCargando(false);
    if (err) {
      setOtpEstado('bad');
      setOtpMsg('Código incorrecto · revisá los 6 dígitos');
      if (!REDUCED) {
        setTimeout(() => {
          setOtp(['', '', '', '', '', '']);
          setOtpEstado('idle');
          otpRefs.current[0]?.focus();
        }, 900);
      }
    } else {
      setOtpEstado('good');
      setOtpMsg('Identidad verificada');
      setAbriendo(true);
      seal();
      // si es válido, onAuthStateChange del shell toma la sesión
    }
  }

  function onOtpChange(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(0, 1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    setOtpEstado('idle');
    setOtpMsg('');
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
    if (next.every((x) => x)) void verificar(next.join(''));
  }

  function onOtpKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      const next = [...otp];
      next[i - 1] = '';
      setOtp(next);
      otpRefs.current[i - 1]?.focus();
    }
  }

  function onOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6).split('');
    if (!digits.length) return;
    const next = [...otp];
    digits.forEach((d, k) => { if (k < 6) next[k] = d; });
    setOtp(next);
    otpRefs.current[Math.min(digits.length, 5)]?.focus();
    if (next.every((x) => x)) void verificar(next.join(''));
  }

  return (
    <div className="dmx-ingreso">
      <main className="stage">
        <div className="folder">
          <span className="cuerda" />
          <div className="sello" ref={sealRef}>
            <svg viewBox="0 0 140 140" id="selloSvg">
              <circle id="ringOut" cx="70" cy="70" r="60" fill="none" stroke="#8F2B22" strokeWidth="2.4" />
              <circle id="ringIn" cx="70" cy="70" r="50" fill="none" stroke="#8F2B22" strokeWidth="1.4" strokeDasharray="2 6" />
              <g id="engrave" stroke="#C94B32" strokeWidth="1.3" opacity=".8">
                <path d="M70 16 A54 54 0 0 1 124 70" fill="none" strokeDasharray="1.5 5.5" />
                <path d="M70 124 A54 54 0 0 1 16 70" fill="none" strokeDasharray="1.5 5.5" />
              </g>
              <g id="emblema" transform="translate(70 70)">
                <g id="lockBody">
                  <rect x="-16" y="-6" width="32" height="26" rx="4" fill="none" stroke="#C94B32" strokeWidth="2.6" />
                  <path id="shackle" d="M-9 -6 L-9 -14 A9 9 0 0 1 9 -14 L9 -6" fill="none" stroke="#C94B32" strokeWidth="2.6" strokeLinecap="round" />
                  <circle cx="0" cy="4" r="2.6" fill="#C94B32" />
                  <line x1="0" y1="6" x2="0" y2="12" stroke="#C94B32" strokeWidth="2.6" strokeLinecap="round" />
                </g>
                <path id="check" d="M-13 1 L-4 10 L14 -10" fill="none" stroke="#4FD9C2" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" opacity="0" />
              </g>
            </svg>
          </div>
        </div>

        <header className="head">
          <p className={`kicker${abriendo ? '' : ' k-ox'}`}><i />{abriendo ? 'Expediente abierto' : paso === 'codigo' ? 'Revisá tu correo' : 'Acceso al expediente'}</p>
          <h1 className="display">
            {abriendo ? <>Abriendo tu<br />expediente.</> : paso === 'codigo' ? <>Ingresá el<br />código.</> : <>Abrí tu<br />expediente.</>}
          </h1>
          <p>
            {abriendo
              ? 'Identidad verificada. Te llevamos a la mesa.'
              : paso === 'codigo'
                ? 'Seis dígitos, recién horneados. Si no aparece, mirá en spam.'
                : 'Tu auditoría queda guardada acá, privada y bajo llave. Entrá para abrirla cuando quieras.'}
          </p>
        </header>

        {!abriendo && (
          <div className="panel">
            {paso === 'metodo' ? (
              <div className="paso">
                <button className="gbtn" onClick={() => void google()}>
                  <svg viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.24 1.26-.96 2.32-2.04 3.04l3.3 2.56c1.92-1.78 3.03-4.4 3.03-7.5 0-.72-.06-1.42-.18-2.1H12z" /><path fill="#34A853" d="M6.6 14.28l-.74.57-2.63 2.05C4.9 19.62 8.2 21.6 12 21.6c2.7 0 4.96-.9 6.62-2.42l-3.3-2.56c-.9.6-2.05.96-3.32.96-2.55 0-4.71-1.72-5.48-4.04z" /><path fill="#FBBC05" d="M3.23 7.35A9.56 9.56 0 002.4 12c0 1.6.4 3.1 1.06 4.42l3.36-2.62A5.7 5.7 0 016.5 12c0-.62.1-1.22.28-1.78L3.23 7.35z" /><path fill="#4285F4" d="M12 6.44c1.47 0 2.79.5 3.83 1.5l2.86-2.86C16.95 3.4 14.7 2.4 12 2.4 8.2 2.4 4.9 4.38 3.23 7.35l3.55 2.87C7.29 8.16 9.45 6.44 12 6.44z" /></svg>
                  Entrar con Google
                </button>
                <div className="sep">o con tu correo</div>
                <input
                  id="dmx-email"
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void mandarCodigo(); }}
                />
                <p className="field-note">Te mandamos un código de 6 dígitos. <b>Sin contraseñas</b> que olvidar.</p>
                <button className="btn submit" disabled={cargando} onClick={() => void mandarCodigo()}>
                  {cargando ? 'Mandando…' : 'Mandame el código'}
                </button>
                {error && <p style={{ color: 'var(--oxide)', textAlign: 'center' }}>{error}</p>}
              </div>
            ) : (
              <div className="paso">
                <p className="mailto">Enviamos el código a <b>{email}</b></p>
                <div className={`otp${otpEstado === 'bad' ? ' bad' : otpEstado === 'good' ? ' good' : ''}`}>
                  {otp.map((d, i) => (
                    <input
                      key={i}
                      ref={(r) => { otpRefs.current[i] = r; }}
                      maxLength={1}
                      inputMode="numeric"
                      aria-label={`dígito ${i + 1}`}
                      className={d ? 'filled' : ''}
                      value={d}
                      disabled={cargando}
                      onChange={(e) => onOtpChange(i, e.target.value)}
                      onKeyDown={(e) => onOtpKeyDown(i, e)}
                      onPaste={onOtpPaste}
                    />
                  ))}
                </div>
                <p className={`otp-msg${otpEstado === 'bad' ? ' err' : otpEstado === 'good' ? ' ok' : ''}`}>{otpMsg}</p>
                <p className="reenvio">
                  ¿No llegó?{' '}
                  <button className="linkish" onClick={() => void mandarCodigo()}>Reenviar</button> ·{' '}
                  <button className="linkish mute" onClick={() => { setPaso('metodo'); setOtp(['', '', '', '', '', '']); setOtpEstado('idle'); setOtpMsg(''); }}>Cambiar correo</button>
                </p>
              </div>
            )}
          </div>
        )}

        <p className="foot">Al entrar aceptás los términos y la privacidad. Tus fotos son tuyas: podés borrar el expediente cuando quieras.</p>
      </main>
    </div>
  );
}

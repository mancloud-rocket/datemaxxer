'use client';

/**
 * F5 - leer el perfil de ella.
 *
 * Máquina de estados: subir → leyendo → informe | rechazado | limite.
 *
 * El estado `rechazado` es su propia pantalla y NO muestra ningún número: el
 * motor decidió no puntuar (menor aparente, ilegible, no es un perfil) y
 * mostrarle scores igual sería exactamente lo que el filtro evita.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalisisRechazado, ProfileRead } from '@percentil/contracts';
import { ApiError, leerPerfil, obtenerLectura } from '../../lib/api';
import { prepararFoto } from '../../lib/imagen';
import { getAccessToken } from '../../lib/supabase';
import { InformePerfil } from './InformePerfil';
import { evento } from '../../lib/analitica';

type Estado =
  | { t: 'subir'; error: string | null; enviando: boolean }
  | { t: 'leyendo'; leidas: number; total: number }
  | { t: 'informe'; lectura: ProfileRead }
  | { t: 'rechazado'; rechazo: AnalisisRechazado }
  | { t: 'limite' };

const MAX = 9;

const MOTIVOS: Record<string, { titulo: string; ayuda: string }> = {
  menor_aparente: {
    titulo: 'No analizamos este perfil',
    ayuda: 'Hay señales de que la persona podría ser menor de edad. Ante la duda no puntuamos, y esto no es negociable.',
  },
  sin_persona_identificable: {
    titulo: 'No se ve a nadie',
    ayuda: 'En los screenshots no hay una persona que se pueda leer. Probá con capturas donde se le vea la cara.',
  },
  imagen_ilegible: {
    titulo: 'No se puede leer',
    ayuda: 'La resolución o el recorte no alcanzan para juzgar nada. Sacá las capturas de nuevo, a pantalla completa.',
  },
  no_es_un_perfil: {
    titulo: 'Esto no es un perfil',
    ayuda: 'Lo que subiste no parece un perfil de una app de citas.',
  },
};

export function LeerPerfil() {
  const [estado, setEstado] = useState<Estado>({ t: 'subir', error: null, enviando: false });
  const [archivos, setArchivos] = useState<File[]>([]);
  const [plataforma, setPlataforma] = useState('otra');
  const [verificada, setVerificada] = useState(false);
  const [bio, setBio] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const polling = useRef<number | undefined>(undefined);

  useEffect(() => {
    const qa = new URLSearchParams(window.location.search).get('estado');
    if (qa === 'rechazado') {
      setEstado({
        t: 'rechazado',
        rechazo: { version: '2.0', rechazado: true, motivo: 'menor_aparente', detalle: 'contexto escolar visible' },
      });
    } else if (qa === 'limite') {
      setEstado({ t: 'limite' });
    }
    return () => { if (polling.current) window.clearInterval(polling.current); };
  }, []);

  function agregar(lista: FileList | null) {
    if (!lista) return;
    const imgs = [...lista].filter((f) => f.type.startsWith('image/'));
    setArchivos((cur) => [...cur, ...imgs].slice(0, MAX));
  }

  const enviar = useCallback(async () => {
    if (archivos.length === 0) return;
    setEstado({ t: 'subir', error: null, enviando: true });

    const token = await getAccessToken();
    if (!token) {
      setEstado({ t: 'subir', error: 'Tu sesión se interrumpió. Recarga la página.', enviando: false });
      return;
    }

    try {
      const form = new FormData();
      for (const f of archivos) form.append('photos', await prepararFoto(f), f.name);
      form.append('plataforma', plataforma);
      form.append('verificada', String(verificada));
      if (bio.trim() !== '') form.append('bio', bio.trim());

      const { read_id } = await leerPerfil(token, form);
      setEstado({ t: 'leyendo', leidas: 0, total: archivos.length });

      polling.current = window.setInterval(() => {
        void (async () => {
          const t = await getAccessToken();
          if (!t) return;
          try {
            const vista = await obtenerLectura(t, read_id);
            if (vista.status === 'analyzing') {
              setEstado({ t: 'leyendo', leidas: vista.progress.fotos_analizadas, total: vista.progress.total || archivos.length });
              return;
            }
            window.clearInterval(polling.current);
            if (vista.status === 'done' && vista.result) {
              evento('perfil_leido');
              setEstado({ t: 'informe', lectura: vista.result });
            }
            else if (vista.status === 'rechazado' && vista.rechazo) setEstado({ t: 'rechazado', rechazo: vista.rechazo });
            else setEstado({ t: 'subir', error: vista.error ?? 'No pudimos leer este perfil.', enviando: false });
          } catch {
            /* un fallo suelto del polling no rompe: se reintenta al próximo tick */
          }
        })();
      }, 2000);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'limit_reached') {
        evento('limite_alcanzado', { funcion: 'perfil' });
        setEstado({ t: 'limite' });
        return;
      }
      setEstado({
        t: 'subir',
        error: err instanceof ApiError ? err.message : 'No pudimos subir los screenshots.',
        enviando: false,
      });
    }
  }, [archivos, plataforma, verificada, bio]);

  function empezarDeNuevo() {
    setArchivos([]);
    setBio('');
    setEstado({ t: 'subir', error: null, enviando: false });
  }

  if (estado.t === 'informe') {
    return <InformePerfil lectura={estado.lectura} onOtra={empezarDeNuevo} />;
  }

  if (estado.t === 'rechazado') {
    const m = MOTIVOS[estado.rechazo.motivo] ?? MOTIVOS.no_es_un_perfil!;
    return (
      <div className="dmx-perfil">
        <div className="rechazo">
          <span className="selloe">Sin análisis</span>
          <h1 className="display">{m.titulo}</h1>
          <p>{m.ayuda}</p>
          <p className="micro">No gastaste cupo.</p>
          <button className="btn" onClick={empezarDeNuevo}>Probar con otro perfil</button>
        </div>
      </div>
    );
  }

  if (estado.t === 'limite') {
    return (
      <div className="dmx-perfil">
        <div className="rechazo">
          <span className="selloe">Sin lecturas</span>
          <h1 className="display">Te quedaste sin lecturas.</h1>
          <p>Con el Copiloto podés leer perfiles todo el mes, antes de gastar un mensaje.</p>
          <a className="btn" href="/app">Ver los planes</a>
        </div>
      </div>
    );
  }

  if (estado.t === 'leyendo') {
    return (
      <div className="dmx-perfil">
        <div className="leyendo">
          <span className="selloe s-cy">Leyendo</span>
          <h1 className="display">Midiendo su perfil.</h1>
          <p className="mono">{estado.leidas} / {estado.total} capturas</p>
          <div className="track"><i style={{ width: `${Math.round((estado.leidas / Math.max(estado.total, 1)) * 100)}%` }} /></div>
          <p className="micro">Toma entre 20 y 50 segundos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dmx-perfil">
      <header className="chead">
        <p className="kicker"><i />Antes de escribirle</p>
        <h1 className="display">¿Tenés chance<br />acá?</h1>
        <p className="hint">
          Subí capturas de su perfil. Te decimos en qué escalón está, cuánto te separa de ella,
          si vale el esfuerzo y con qué abrirle.
        </p>
      </header>

      <div
        className={`zona${drag ? ' drag' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); agregar(e.dataTransfer.files); }}
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
            <h3>Subí las capturas de su perfil</h3>
            <p>Hasta {MAX}. Cuantas más fotos suyas se vean, más exacta la lectura.</p>
          </>
        ) : (
          <div className="miniaturas">
            {archivos.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${f.name}-${i}`} src={URL.createObjectURL(f)} alt="" />
            ))}
            <span className="mas">+</span>
          </div>
        )}
      </div>

      <section className="campos">
        <label className="campo-label">
          <span>¿En qué app?</span>
          <div className="chips">
            {['tinder', 'bumble', 'hinge', 'otra'].map((p) => (
              <button
                key={p}
                type="button"
                className={`chip${plataforma === p ? ' on' : ''}`}
                onClick={() => setPlataforma(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </label>

        <label className="check">
          <input type="checkbox" checked={verificada} onChange={(e) => setVerificada(e.target.checked)} />
          <span>Su perfil tiene el tilde de verificado</span>
        </label>

        <label className="campo-label">
          <span>Su bio, si la copiaste</span>
          <textarea
            className="campo"
            rows={3}
            maxLength={2000}
            placeholder="Pega el texto de su perfil. Opcional, pero afina mucho la lectura."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </label>
      </section>

      {estado.error && <p className="err-general">{estado.error}</p>}

      <div className="accion">
        <button className="btn" disabled={archivos.length === 0 || estado.enviando} onClick={() => void enviar()}>
          {estado.enviando ? 'Subiendo…' : 'Leer este perfil'}
        </button>
        {archivos.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setArchivos([])}>Vaciar</button>
        )}
      </div>
    </div>
  );
}

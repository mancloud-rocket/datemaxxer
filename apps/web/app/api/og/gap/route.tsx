import { ImageResponse } from 'next/og';

/**
 * Card compartible del gap.
 *
 * Los datos viajan en la URL, no en la base. Motivo: la card solo lleva números
 * (la distancia, cuánto es recuperable, el techo) y ninguna referencia a la
 * persona del otro lado. Guardarla implicaría persistir el análisis de un
 * tercero para que alguien lo mire una vez en WhatsApp, y no hace falta.
 *
 * La card que se comparte es la del GAP, no la del arquetipo: un número contra
 * otro número es contenido, un arquetipo es un test de Facebook.
 */

export const runtime = 'edge';

const VOID = '#0A0908';
const INK = '#EDE7E0';
const SIGNAL = '#4FD9C2';
const OXIDE = '#C94B32';
const STEEL = '#5F584F';

function num(v: string | null, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : def;
}

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const delta = Math.max(0, Math.min(100, num(searchParams.get('d'), 0)));
  const cerrables = Math.max(0, Math.min(delta, num(searchParams.get('c'), 0)));
  const rasgos = delta - cerrables;
  const pct = delta > 0 ? Math.round((cerrables / delta) * 100) : 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: VOID,
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 6, color: OXIDE, textTransform: 'uppercase' }}>
            Datemaxxer
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 28 }}>
            <span style={{ fontSize: 200, fontWeight: 800, color: INK, lineHeight: 1 }}>{delta}</span>
            <span style={{ fontSize: 44, color: STEEL, marginLeft: 24 }}>puntos de distancia</span>
          </div>
        </div>

        {/* La barra partida: es todo el argumento en una imagen. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', width: '100%', height: 26, borderRadius: 13, overflow: 'hidden', background: '#1A202A' }}>
            <div style={{ display: 'flex', width: `${pct}%`, background: SIGNAL }} />
            <div style={{ display: 'flex', width: `${100 - pct}%`, background: STEEL }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, fontSize: 38 }}>
            <span style={{ color: SIGNAL }}>{cerrables} los recupero yo</span>
            <span style={{ color: STEEL }}>{rasgos} son rasgos</span>
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 30, color: STEEL }}>
          Medí en qué escalón estás · datemaxxer.app
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

import type { Metadata } from 'next';

/**
 * Página pública de la card compartida.
 *
 * Existe para que al pegar el link en WhatsApp o Instagram salga la imagen (las
 * previsualizaciones leen las meta og:, no la imagen suelta), y para que quien
 * la abre caiga en una pantalla que le explica qué es y lo invita a medirse.
 *
 * No lleva ningún dato de la otra persona: solo la distancia, cuánto es
 * recuperable y el techo. Todo viaja en la URL.
 */

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function leer(v: string | string[] | undefined, def: number): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : def;
}

export async function generateMetadata({ searchParams }: Params): Promise<Metadata> {
  const sp = await searchParams;
  const d = leer(sp.d, 0);
  const c = Math.min(leer(sp.c, 0), d);
  const og = `/api/og/gap?d=${d}&c=${c}`;
  return {
    title: `${d} puntos de distancia · Datemaxxer`,
    description: `${c} de esos ${d} puntos son recuperables. Medí en qué escalón estás.`,
    openGraph: {
      title: `${d} puntos de distancia`,
      description: `${c} de esos ${d} puntos son recuperables.`,
      images: [{ url: og, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', images: [og] },
  };
}

export default async function GapPage({ searchParams }: Params) {
  const sp = await searchParams;
  const d = leer(sp.d, 0);
  const c = Math.min(leer(sp.c, 0), d);
  const rasgos = d - c;
  const pct = d > 0 ? Math.round((c / d) * 100) : 0;

  return (
    <main className="gap-share">
      <p className="marca">Datemaxxer</p>
      <div className="cifra">
        <b>{d}</b>
        <span>puntos de distancia</span>
      </div>

      <div className="barra">
        <i style={{ width: `${pct}%`, background: 'var(--signal)' }} />
        <i style={{ width: `${100 - pct}%`, background: 'var(--steel-dim)' }} />
      </div>
      <div className="leyenda">
        <span style={{ color: 'var(--signal)' }}>{c} recuperables</span>
        <span style={{ color: 'var(--steel)' }}>{rasgos} son rasgos</span>
      </div>

      <p className="pitch">
        No es cuánto valés. Es en qué escalón del mercado estás parado, y cuántos de esos
        puntos dependen de vos.
      </p>
      <a className="cta" href="/app">Medir mi perfil</a>
    </main>
  );
}

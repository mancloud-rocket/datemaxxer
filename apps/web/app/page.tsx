// Placeholder Fase 0. En Fase 1 se migra el landing existente (percentil-landing.html).
export default function Home() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '32rem' }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-mute)',
            fontSize: '0.8rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          Percentil — Fase 0
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            letterSpacing: '-0.035em',
            fontSize: '2.5rem',
            margin: '1rem 0',
          }}
        >
          El mercado está <span style={{ color: 'var(--sodium)' }}>torcido</span>.
          <br />
          <span style={{ color: 'var(--signal)' }}>Movete de lugar.</span>
        </h1>
        <p style={{ color: 'var(--ink-mute)' }}>
          Infra montada. El landing llega en Fase 1.
        </p>
      </div>
    </main>
  );
}

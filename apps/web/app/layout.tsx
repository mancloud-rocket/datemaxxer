import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Archivo_Black, IBM_Plex_Mono, Inter_Tight } from 'next/font/google';
import './globals.css';

const display = Archivo_Black({ weight: '400', subsets: ['latin'], variable: '--font-display' });
const mono = IBM_Plex_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-mono' });
const body = Inter_Tight({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-body' });

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

/* metadataBase: setear cuando se defina el dominio real de producción
   (ítem 3 de la checklist en docs/percentil-spec.md §13) - sin esto Next
   resuelve las URLs absolutas de OG contra localhost en dev y warnea en
   build; en Vercel se autocompleta con la URL del deploy mientras tanto. */
const TITLE = 'Datemaxxer - El mercado está torcido. Muévete de lugar.';
const DESCRIPTION = 'Tu copiloto de citas. Datos, no humo.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  /* favicon/apple-icon: NO se declaran acá - Next los detecta solo por
     convención de archivo (app/icon.svg, app/apple-icon.png) y declararlos
     también acá duplicaría los <link> generados. */
  openGraph: {
    title: 'Datemaxxer',
    description: DESCRIPTION,
    siteName: 'Datemaxxer',
    type: 'website',
    locale: 'es_419',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Datemaxxer',
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${mono.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Archivo_Black, IBM_Plex_Mono, Inter_Tight } from 'next/font/google';
import './globals.css';

const display = Archivo_Black({ weight: '400', subsets: ['latin'], variable: '--font-display' });
const mono = IBM_Plex_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-mono' });
const body = Inter_Tight({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-body' });

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export const metadata: Metadata = {
  title: 'Datemaxxer — El mercado está torcido. Movete de lugar.',
  description: 'Tu copiloto de citas. Datos, no humo.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${mono.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}

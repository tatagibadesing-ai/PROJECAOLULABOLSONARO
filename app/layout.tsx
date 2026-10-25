import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'Observatório · Presidencial 2026',
  description: 'Projeção, apuração e auditoria eleitoral com fontes verificáveis e incerteza explícita.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}><body>{children}</body></html>;
}

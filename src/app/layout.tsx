import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Neura Landscape | Operaciones',
  description: 'Gestión de clientes, propiedades, equipos y operaciones de paisajismo.',
  robots: { index: false, follow: false, nocache: true },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}

import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Neura Landscape | Experimental',
  description: 'Base experimental de Neura Landscape.',
  robots: { index: false, follow: false, nocache: true },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}

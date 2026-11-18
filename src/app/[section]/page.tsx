import { notFound } from 'next/navigation';
import { CommandCenter, sections } from '../_components/command-center';
export const dynamicParams = false;
export function generateStaticParams() { return sections.filter(s => s.id !== 'resumen').map(s => ({ section: s.id })); }
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.some(s => s.id === section && s.id !== 'resumen')) notFound();
  return <CommandCenter section={section} />;
}

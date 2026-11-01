import { ExperimentalNotice } from '@/shared/ui';
export default function Home() {
  return (
    <main>
      <header><span className="brand">NEURATEC / LANDSCAPE</span><ExperimentalNotice /></header>
      <section aria-labelledby="title" className="intro">
        <p className="eyebrow">MISIÓN LOCAL 001</p>
        <h1 id="title">Una base sólida.<br /><span>Un paisaje por construir.</span></h1>
        <p className="description">Neura Landscape explora una plataforma modular para conectar personas, operaciones y herramientas de paisajismo.</p>
        <a href="#foundation">Explorar la base <span aria-hidden="true">↓</span></a>
      </section>
      <section id="foundation" aria-labelledby="foundation-title">
        <h2 id="foundation-title">Fundación experimental</h2>
        <div className="grid">
          <article><span>01 / ARQUITECTURA</span><h3>Modular desde el inicio</h3><p>Límites claros para evolucionar con capacidades comunes.</p></article>
          <article><span>02 / ESTADO</span><h3>Exploración local</h3><p>Prototipo precomercial. Sin datos de clientes ni servicios conectados.</p></article>
          <article><span>03 / DIRECCIÓN</span><h3>Integración gradual</h3><p>Preparado para evaluar componentes corporativos versionados.</p></article>
        </div>
      </section>
      <footer>Neura Landscape · Entorno experimental · Sin lanzamiento comercial aprobado</footer>
    </main>
  );
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

// Literal paths keep deployment tracing scoped to these documents instead of
// copying the entire archive of source datasets into each server function.
const documents: Record<string, { read: () => Promise<string> }> = {
  metodo: { read: () => fs.readFile(path.join(process.cwd(), 'METODO.md'), 'utf8') },
  leitura: { read: () => fs.readFile(path.join(process.cwd(), 'LEITURA.md'), 'utf8') },
  decisoes: { read: () => fs.readFile(path.join(process.cwd(), 'DECISOES.md'), 'utf8') },
  fontes: { read: () => fs.readFile(path.join(process.cwd(), 'dados/FONTES.md'), 'utf8') },
  pesquisas: { read: () => fs.readFile(path.join(process.cwd(), 'dados/PESQUISAS.md'), 'utf8') },
  notas: { read: () => fs.readFile(path.join(process.cwd(), 'NOTAS.md'), 'utf8') },
  auditoria: { read: () => fs.readFile(path.join(process.cwd(), 'AUDITORIA.md'), 'utf8') },
};

export async function generateStaticParams() {
  return Object.keys(documents).map(slug => ({ slug }));
}

export default async function DocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = documents[slug];
  if (!document) notFound();
  let content: string;
  try { content = await document.read(); }
  catch { content = '# Documento em preparação\n\nA verificação ainda está em andamento. Nenhum resultado é certificado pela ausência deste documento.'; }
  return <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 100px' }}>
    <Link href="/" style={{ color: '#a4acba', fontSize: 14 }}>← Voltar ao observatório</Link>
    <div style={{ margin: '32px 0 16px', fontSize: 12, color: '#858d9c' }}>Observatório · Transparência</div>
    <article className="document-content"><ReactMarkdown>{content}</ReactMarkdown></article>
    <style>{`.document-content{line-height:1.8;color:#bfc5cf;font-size:15px}.document-content h1{font-size:32px;line-height:1.2;color:#f0f1f4;margin:24px 0}.document-content h2{font-size:22px;color:#f0f1f4;margin:36px 0 12px}.document-content h3{font-size:17px;color:#e0e3e8;margin:28px 0 8px}.document-content p{margin:16px 0}.document-content a{color:#b9cfff;text-decoration:underline}.document-content ul,.document-content ol{padding-left:24px;list-style:revert}.document-content pre{background:#15171d;padding:20px;overflow:auto;border:1px solid #2a2d36;border-radius:8px}.document-content code{font-family:var(--font-geist-mono),monospace;font-size:.87em}.document-content strong{color:#e4e6ec}.document-content hr{border-color:#292d34;margin:30px 0}`}</style>
  </main>;
}

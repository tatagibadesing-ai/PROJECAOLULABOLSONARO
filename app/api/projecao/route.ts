import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifySnapshot } from '../../../lib/projection-snapshot';
import { presentProjectionSnapshot } from '../../../lib/projection-presentation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const raw = await readFile(path.join(process.cwd(), 'projecao-final.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const query = new URL(request.url).searchParams;
    if (query.get('download') === '1') {
      verifySnapshot(parsed);
      // Vercel Functions cap response bodies at 4.5 MB. The build copies the
      // immutable original into public/ so its 23 MB download uses the CDN.
      if (process.env.VERCEL === '1') return new Response(null, { status: 307, headers: { Location: new URL('/projecao-final.json', request.url).toString(), 'Cache-Control': 'no-store' } });
      return new Response(raw, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="projecao-final.json"', 'Cache-Control': 'no-store' } });
    }
    if (query.get('metadata') === '1') {
      const snapshot = verifySnapshot(parsed);
      const { projection, ...metadata } = snapshot;
      void projection;
      return Response.json(metadata, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(presentProjectionSnapshot(parsed), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'invalid', frozen: false, message: 'Arquivo congelado ausente ou com hash inválido. Comparação bloqueada.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

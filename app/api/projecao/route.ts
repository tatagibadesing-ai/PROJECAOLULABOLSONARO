import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifySnapshot } from '../../../lib/projection-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const raw = await readFile(path.join(process.cwd(), 'projecao-final.json'), 'utf8');
    const snapshot = verifySnapshot(JSON.parse(raw));
    const query = new URL(request.url).searchParams;
    if (query.get('download') === '1') return new Response(raw, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="projecao-final.json"', 'Cache-Control': 'no-store' } });
    if (query.get('metadata') === '1') {
      const { projection, ...metadata } = snapshot;
      void projection;
      return Response.json(metadata, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'invalid', frozen: false, message: 'Arquivo congelado ausente ou com hash inválido. Comparação bloqueada.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

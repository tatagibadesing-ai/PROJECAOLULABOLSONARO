import { type ApuracaoResponse } from "../../../lib/apuracao";
import { getMunicipalCollector, getRuntimeCollector } from "../../../lib/apuracao-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cache is per process: production must run a single collector, or use an external shared cache.
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if (query.has("municipio") || query.has("uf")) {
      const uf = query.get("uf") ?? "", municipality = query.get("municipio") ?? "";
      if (!/^[A-Za-z]{2}$/.test(uf) || !/^\d{5}$/.test(municipality)) return Response.json({ error: "Informe UF e código municipal do TSE com cinco dígitos." }, { status: 400 });
      const collector = await getMunicipalCollector(uf, municipality);
      if (!collector) return Response.json({ error: "Município não encontrado na base oficial instalada dessa UF." }, { status: 404 });
      return Response.json({ ...await collector.service.get(), municipality: { id: collector.id, name: collector.name, uf: collector.uf, code: collector.code } }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(await getRuntimeCollector().service.get(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    const body: ApuracaoResponse = { status: "unconfigured", source: "TSE", fetchedAt: null, attemptedAt: null, nextPollAt: null, message: "Configuração inválida do TSE. Verifique URL oficial, eleição e os dois identificadores dos candidatos no servidor.", data: null };
    return Response.json(body, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

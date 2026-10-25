import { getRuntimeCollector } from "../../../lib/apuracao-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const { store, storage } = getRuntimeCollector();
    const history = store ? await store.history() : { points: [], rejectedEntries: 0, limit: 2000 };
    return Response.json({
      source: "TSE", interpolated: false, ...history,
      storage: { mode: storage.mode, shared: storage.shared, message: storage.message },
      message: `Boletins nacionais efetivamente recebidos por esta instalação, com assinatura novamente verificada. Não reconstitui períodos em que o aplicativo esteve fechado. Não é a trajetória de uma projeção congelada. ${storage.message}`,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ source: "TSE", interpolated: false, points: [], error: "O histórico local não pôde ser lido ou validado. A apuração atual permanece disponível." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

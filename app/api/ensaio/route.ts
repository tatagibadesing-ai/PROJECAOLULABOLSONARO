import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { prepareReplay, replayAt, REPLAY_ORDERS, type ReplayOrder, type ReplaySource, type PreparedReplay } from "@/lib/replay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
let prepared: Promise<PreparedReplay> | undefined;

function load() {
  if (!prepared) {
    prepared = readFile(join(process.cwd(), "public/data/first-round-2026.json"), "utf8")
      .then((text) => prepareReplay(JSON.parse(text) as ReplaySource))
      .catch((error) => { prepared = undefined; throw error; });
  }
  return prepared;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawStep = params.get("step") ?? "0";
  const order = params.get("order") ?? "totalization";
  const step = Number(rawStep);
  if (!/^\d{1,3}$/.test(rawStep) || !Number.isInteger(step) || step < 0 || step > 100 || !REPLAY_ORDERS.includes(order as ReplayOrder)) {
    return NextResponse.json({ kind: "replay-error", error: "Use step inteiro entre 0 e 100 e order=state|timezone|totalization." }, { status: 400 });
  }
  try {
    return NextResponse.json(replayAt(await load(), step, order as ReplayOrder), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ kind: "replay-error", error: "Base verificada do primeiro turno indisponível ou inconsistente. Ensaio não iniciado." }, { status: 503 });
  }
}

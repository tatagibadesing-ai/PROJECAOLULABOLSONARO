#!/usr/bin/env node
// Node >=24 supports TypeScript stripping. This script scores only externally prepared,
// evidence-backed projections; it does not fit parameters against the observed result.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { assessBacktestReadiness, compareBacktestVariants } from "../lib/backtest.ts";

const root = resolve(import.meta.dirname, "..");
const load = async (relative) => {
  try { return JSON.parse(await readFile(resolve(root, relative), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
};
const previous = await load("public/data/backtest-2022.json");
if (previous?.status === "conditional-measured") {
  // A measured conditional retrospective is useful evidence even when its
  // assumptions and documentary vintage prevent prospective validation. Keep it
  // instead of overwriting it with a generic missing-prerequisites placeholder.
  const changedInputs = [];
  if (!Array.isArray(previous.inputHashes) || previous.inputHashes.length === 0) changedInputs.push("input hash manifest missing");
  for (const input of previous.inputHashes ?? []) {
    try {
      const actual = createHash("sha256").update(await readFile(resolve(root, input.path))).digest("hex");
      if (actual !== input.sha256) changedInputs.push(input.path);
    } catch { changedInputs.push(input.path); }
  }
  console.log(JSON.stringify({
    status: changedInputs.length ? "stale-conditional-measurement" : "conditional-measured",
    preserved: "public/data/backtest-2022.json", validated: false,
    changedInputs,
    note: changedInputs.length ? "Entradas mudaram: execute scripts/project.mjs antes do fechamento para recalcular; a medição anterior foi preservada com sua data." : "Medição condicional já calculada com os mesmos arquivos. Não equivale a validação prospectiva ou de cobertura.",
    nationalMarginErrorPp: previous.results?.pollOnly?.national?.marginErrorPp,
    stateMeanAbsoluteErrorPp: previous.results?.pollOnly?.stateMeanAbsoluteErrorPp,
  }, null, 2));
  process.exit(changedInputs.length ? 2 : 0);
}
const first = await load("public/data/round-1-2022.json");
const second = await load("public/data/round-2-2022.json");
const inputs = await load("dados/backtest-inputs-2022.json");
const verification = await load("dados/verification.json");
const historical = await load("public/data/historical-error.json");
const baseline = await load("dados/backtest-polls-only-2022.json");
const corrected = await load("dados/backtest-corrected-2022.json");
const check = assessBacktestReadiness({
  officialFirstRoundVerified: first?.year === 2022 && first?.round === 1 && verification?.checks?.some((check) => check.file === "public/data/round-1-2022.json" && check.status === "passed") === true,
  officialSecondRoundVerified: second?.year === 2022 && second?.round === 2 && verification?.checks?.some((check) => check.file === "public/data/round-2-2022.json" && check.status === "passed") === true,
  electionDayPollsVerified: inputs?.electionDayPollsVerified === true,
  transferMatrixEvidence: inputs?.transferMatrixEvidence === true,
  historicalErrorEstimateVerified: inputs?.historicalErrorEstimateVerified === true,
  inputsCutoff: inputs?.inputsCutoff ?? null,
  pollsOnlyProjectionAvailable: baseline != null,
  correctedProjectionAvailable: corrected != null,
});
const report = {
  generatedAt: new Date().toISOString(),
  kind: "backtest-2022",
  status: check.status === "eligible-for-scoring" ? "scored" : "blocked",
  blockers: check.blockers,
  actualDataAvailable: { firstRound: first != null, secondRound: second != null },
  historicalNationalEstimate: historical == null ? null : { status: historical.status, nElections: historical.nElections, sigmaLogit: historical.sigmaLogit, publicationReady: historical.publicationReady },
  results: check.status === "eligible-for-scoring" ? compareBacktestVariants(second, baseline, corrected) : null,
  disclaimer: "Dados oficiais presentes não equivalem a um modelo testado. Fixtures sintéticas da suíte não medem erro histórico. Nenhum parâmetro é ajustado por este script.",
};
await mkdir(resolve(root, "public/data"), { recursive: true });
await writeFile(resolve(root, "public/data/backtest-2022.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status === "blocked") process.exitCode = 2;

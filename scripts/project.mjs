#!/usr/bin/env node
/** Conditional projection and conditional retrospective. None of the constants
 * below encode observed second-round outcomes or fitted state-level errors. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { buildConditionalInput, executeConditional, expectedProjection } from "../lib/forecast.ts";
import { compareBacktestVariants, scoreBacktest } from "../lib/backtest.ts";

const root = resolve(import.meta.dirname, "..");
const json = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const write = async (path, value, pretty = false) => writeFile(resolve(root, path), `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`);
const hash = (data) => createHash("sha256").update(data).digest("hex");
const assumptions = await json("dados/model-assumptions.json");
const evidence = await json("dados/pesquisas-evidencias.json");
const historical = await json("public/data/historical-error.json");
const publishedPolls = await json("public/data/polls.json");
const first2026 = await json("public/data/first-round-2026.json");
const first2022 = await json("public/data/round-1-2022.json");
const second2022 = await json("public/data/round-2-2022.json");
const first2018 = await json("public/data/round-1-2018.json");
const second2018 = await json("public/data/round-2-2018.json");
const transfers2026 = await json("dados/transferencias-2026.json");
const transfers2022 = await json("dados/transferencias-2022.json");
const generatedAt = new Date().toISOString();
if (Date.parse(generatedAt) >= Date.parse("2026-10-25T20:00:00Z")) throw new Error("Geração da base2026 bloqueada após o fechamento: preserve a projeção anterior. Cenários de sensibilidade não substituem a base congelada.");
const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

function pollingMean(year, asOf, candidateName) {
  const selected = evidence.polls.filter((poll) => poll.year === year && poll.round === 2 && poll.scope === "BR" && poll.denominator === "valid" && ["primary-publication", "primary-publication-by-poll-sponsor"].includes(poll.verification) && poll.registration && poll.sample > 0 && Date.parse(`${poll.fieldEnd}T00:00:00-03:00`) <= Date.parse(asOf) && (!poll.publicationMetadata?.datePublished || Date.parse(poll.publicationMetadata.datePublished) <= Date.parse(asOf)));
  if (!selected.length) throw new Error(`Sem pesquisas primárias elegíveis em ${year}.`);
  const weighted = selected.map((poll) => {
    const measured = poll.candidates.find((candidate) => normalize(candidate.name) === normalize(candidateName));
    if (!measured) throw new Error(`Identidade não encontrada em ${poll.id}.`);
    const age = (Date.parse(asOf) - Date.parse(`${poll.fieldEnd}T23:59:59-03:00`)) / 86400000;
    return { id: poll.id, share: measured.percent / 100, weight: Math.sqrt(poll.sample) * 2 ** (-Math.max(0, age) / 5), sourceUrl: poll.sourceUrl, institute: poll.institute, fieldEnd: poll.fieldEnd, sample: poll.sample, registration: poll.registration };
  });
  const total = weighted.reduce((sum, poll) => sum + poll.weight, 0);
  return { share: weighted.reduce((sum, poll) => sum + poll.share * poll.weight, 0) / total, asOf, polls: weighted.map((poll) => ({ ...poll, normalizedWeight: poll.weight / total })), completeCatalog: false, registrationVerifiedDirectly: false };
}
const polls2026 = pollingMean(2026, publishedPolls.asOf, "Flávio Bolsonaro");
if (Math.abs(polls2026.share * 100 - publishedPolls.average.flavio) > 1e-10) throw new Error("Média de pesquisas diverge da série preparada: revise convenção temporal e entradas antes de calcular.");
const polls2022 = pollingMean(2022, "2022-10-29T23:59:59Z", "Jair Bolsonaro");
const firstRoundPoll = evidence.firstRoundEvidence?.find((poll) => poll.year === 2026 && poll.denominator === "valid");
let firstRoundBiasLogit = 0;
if (firstRoundPoll) {
  const a = firstRoundPoll.candidates.find((candidate) => normalize(candidate.name) === normalize("Flávio Bolsonaro"))?.percent;
  const b = firstRoundPoll.candidates.find((candidate) => normalize(candidate.name) === normalize("Lula"))?.percent;
  if (a > 0 && b > 0) firstRoundBiasLogit = Math.log(first2026.national.votes["22"] / first2026.national.votes["13"]) - Math.log(a / b);
}
const common2026 = { base: first2026, historyFirst: first2022, historySecond: second2022, assumptions, transfers: transfers2026, historicalErrors: historical, targetShare: polls2026.share, pollSources: polls2026.polls.map((poll) => poll.sourceUrl), firstRoundBiasLogit, seed: 20261024, simulations: 20000 };
console.log("Preparando matriz municipal condicional2026...");
const built2026 = buildConditionalInput(common2026);
const inputHashes = await Promise.all(["dados/model-assumptions.json", "dados/transferencias-2026.json", "public/data/first-round-2026.json", "public/data/round-1-2022.json", "public/data/round-2-2022.json", "dados/pesquisas-evidencias.json", "public/data/historical-error.json", "public/data/polls.json", "lib/forecast.ts", "public/model-worker.js", "scripts/project.mjs"].map(async (path) => ({ path, sha256: hash(await readFile(resolve(root, path))) })));
const compactInput = { ...built2026.input, cities: built2026.input.cities.map((city) => ({ ...city, groups: city.groups.map(({ id, name, role, count, transfer }) => ({ id, name, role, count, transfer })) })) };
await mkdir(resolve(root, "public/data"), { recursive: true });
await write("public/data/projection-input.json", compactInput);
console.log(`Simulando2026:20.000 sorteios×${built2026.input.cities.length} localidades.`);
let previousProgress = -1;
const result2026 = executeConditional(built2026.input, (progress) => { const bucket = Math.floor(progress * 10); if (bucket !== previousProgress) { console.log(`2026:${Math.round(progress * 100)}%`); previousProgress = bucket; } });
const cityById = new Map(first2026.cities.map((city) => [city.id, city]));
const stateById = new Map(first2026.states.map((state) => [state.uf, state]));
const projection = {
  ...result2026, generatedAt,
  provenance: built2026.input.provenance, assumptions,
  publicationReady: false, coverageValidated: false,
  status: "conditional-computed",
  pollAverage: polls2026,
  calibration: built2026.calibration,
  controlDefaults: built2026.controlDefaults,
  input: compactInput,
  inputHashes,
  inputHash: hash(JSON.stringify(compactInput)),
  candidates: [{ number: "22", name: "Flávio Bolsonaro", party: "PL" }, { number: "13", name: "Lula", party: "PT" }],
  flows: built2026.flows,
  states: result2026.states.map((state) => ({ ...state, name: stateById.get(state.id)?.name ?? state.id })),
  cities: result2026.cities.map((city) => { const source = cityById.get(city.id); return { ...city, name: source?.name ?? city.id, tseCode: source?.tseCode, firstRound: source }; }),
};
await write("public/data/projection-conditional.json", projection);
console.log("Projeção condicional2026 salva; iniciando retrospecto2022 sem ajustar parâmetros ao resultado.");

const common2022 = { base: first2022, historyFirst: first2018, historySecond: second2018, assumptions, transfers: transfers2022, historicalErrors: historical, targetShare: polls2022.share, pollSources: polls2022.polls.map((poll) => poll.sourceUrl), firstRoundBiasLogit: 0, seed: 20221029, simulations: 20000 };
const built2022 = buildConditionalInput(common2022);
const ecological2022 = buildConditionalInput({ ...common2022, variant: "ecological" });
console.log(`Simulando2022:20.000 sorteios×${built2022.input.cities.length} localidades; escala histórica exclui2022.`);
previousProgress = -1;
const result2022 = executeConditional(built2022.input, (progress) => { const bucket = Math.floor(progress * 10); if (bucket !== previousProgress) { console.log(`2022:${Math.round(progress * 100)}%`); previousProgress = bucket; } });
function scoredProjection(result, label) {
  return { label, year: 2022, candidateNumbers: ["22", "13"], national: { id: "BR", candidateAShare: result.national.flavio.share, interval80: result.national.flavio.interval }, states: result.states.filter((state) => state.id !== "ZZ").map((state) => ({ id: state.id, candidateAShare: state.flavio.share, interval80: state.flavio.interval })) };
}
const pollOnly = scoredProjection(result2022, "Transferência condicional e calibração à pesquisa; correção de instituto zero");
const corrected = { ...pollOnly, label: "Mesma projeção: correção zero por falta de evidência de persistência" };
const ecologicalPoint = expectedProjection(ecological2022.input.cities);
const ecological = { label: "Transferência ecológica condicional antes da calibração nacional", year: 2022, candidateNumbers: ["22", "13"], national: { id: "BR", candidateAShare: ecologicalPoint.national.share, interval80: null }, states: ecologicalPoint.states.filter((state) => state.id !== "ZZ").map((state) => ({ id: state.id, candidateAShare: state.share, interval80: null })) };
const report = {
  generatedAt: new Date().toISOString(), kind: "backtest-2022", status: "conditional-measured", validated: false,
  candidateOrder: [{ number: "22", name: "Jair Bolsonaro" }, { number: "13", name: "Lula" }],
  simulations: result2022.simulations,
  assumptionsVersion: assumptions.version,
  calibration: built2022.calibration,
  inputHashes: await Promise.all(["dados/model-assumptions.json", "dados/transferencias-2022.json", "public/data/round-1-2022.json", "public/data/round-2-2022.json", "public/data/round-1-2018.json", "public/data/round-2-2018.json", "public/data/historical-error.json", "dados/pesquisas-evidencias.json", "lib/forecast.ts", "public/model-worker.js"].map(async (path) => ({ path, sha256: hash(await readFile(resolve(root, path))) }))),
  pollAverage: polls2022,
  results: compareBacktestVariants(second2022, pollOnly, corrected),
  ecological: scoreBacktest(second2022, ecological),
  audit: result2022.audit,
  correction: { coefficient: 0, reason: "Não há evidência verificada de persistência que justifique afastar a projeção da média parcial; as variantes sem/com correção coincidem deliberadamente." },
  limitations: ["Retrospecto condicional calculado, não validação prospectiva. Documento de pesquisa2022 arquivado após divulgação; vazamento documental não excluído.", "Sem ajuste dos hiperparâmetros aos erros estaduais de2022. Matriz incompleta foi complementada com as hipóteses versionadas antes de executar a pontuação.", "Comportamento usa2018 e escala nacional só2014/2018; o resultado2022 entra apenas na pontuação depois da simulação.", "Cobertura observada em27estados correlacionados não é uma demonstração de calibração geral. Não se deve esperar exatamente80% numa amostra pequena.", "Versão ecológica mostra pontos anteriores à calibração; não se calculou cobertura para essa variante."],
};
await write("public/data/backtest-2022.json", report, true);
await write("dados/backtest-polls-only-2022.json", pollOnly, true);
await write("dados/backtest-corrected-2022.json", corrected, true);
console.log(JSON.stringify({ projection: "public/data/projection-conditional.json", simulations: result2026.simulations, locations: result2026.cities.length, nationalConditionalShare: result2026.national.flavio.share, nationalInterval80: result2026.national.flavio.interval, backtest: "public/data/backtest-2022.json", backtestNationalMarginErrorPp: report.results.pollOnly.national.marginErrorPp, backtestStateMaePp: report.results.pollOnly.stateMeanAbsoluteErrorPp, backtestCoverage: report.results.pollOnly.intervalCoverage, validated: false }, null, 2));

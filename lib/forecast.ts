/** Conditional electoral model. Evidence and assumptions remain separate; running
 * a mathematical model does not certify its probabilities or interval coverage. */
import { allocateIntegers, calibrateShares, runSimulation } from "../public/model-worker.js";

export type TransferRow = [number, number, number, number, number];
export type ForecastGroup = { id: string; name: string; role: "own" | "other" | "inactive" | "invalid" | "uninstalled"; count: number; transfer: TransferRow; origin: string; observed?: unknown };
export type ForecastCity = { id: string; state: string; region: string; electorate: number; groups: ForecastGroup[] };
export interface Territory {
  id: string; uf: string; name: string; electorate: number; abstention: number; blank: number; null: number; valid: number;
  votes: Record<string, number>; notInstalledElectorate?: number; annulledSeparate?: number; tseCode?: string;
}
export interface ElectionData { year: number; round: number; source: unknown; candidates: { number: string; name: string; party: string; votes: number }[]; national: Territory; states: Territory[]; cities: Territory[] }
export interface Assumptions {
  version: string; label: string; status: string; rules: string[];
  defaults: { ownStay: number; ownCross: number; otherNonvalid: number; otherValidShareA: number; invalidReturn: number; abstentionReturn: number; notInstalledReturn: number; rowFloor: number; behaviorShrinkElectors: number; biasCorrection: number };
  uncertainty: { nationalStructural: number; regional: number; city: number; turnout: number; invalid: number; [key: string]: unknown };
}
export interface ConditionalInput {
  scenario: "conditional"; seed: number; simulations: number; cities: ForecastCity[];
  uncertainty: { national: number; regional: number; city: number; turnout: number; invalid: number };
  provenance: { label: string; assumptionsVersion: string; sources: string[]; limitations: string[] };
}
export interface Controls { otherTransferPct: number; abstentionDeltaPp: number; biasCorrection: number; groupShares?: Record<string, number> }
export interface ControlDefaults extends Controls { firstRoundBiasLogit: number }
export interface ForecastRequest {
  base: ElectionData; historyFirst: ElectionData; historySecond: ElectionData;
  assumptions: Assumptions;
  transfers: { sourceUrl?: string; rows: Record<string, unknown>[]; [key: string]: unknown };
  historicalErrors: { errors: { year: number; errorLogit: number }[] };
  targetShare: number; pollSources: string[]; firstRoundBiasLogit?: number;
  simulations?: number; seed?: number;
  variant?: "ecological" | "poll-calibrated";
}
const FIELDS = ["flavio", "lula", "blank", "null", "abstention"] as const;
const REGION: Record<string, string> = { AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte", AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste", PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste", DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste", ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste", PR: "Sul", RS: "Sul", SC: "Sul", ZZ: "Exterior" };
const logistic = (value: number) => 1 / (1 + Math.exp(-value));
const logit = (value: number) => Math.log(Math.max(1e-8, Math.min(1 - 1e-8, value)) / (1 - Math.max(1e-8, Math.min(1 - 1e-8, value))));
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
function ensure(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function normalized(row: number[]): TransferRow {
  ensure(row.length === 5 && row.every((value) => Number.isFinite(value) && value >= 0), "Matriz com peso inválido.");
  const total = row.reduce((a, b) => a + b, 0);
  ensure(total > 0, "Matriz sem destino.");
  return row.map((value) => value / total) as TransferRow;
}

/** Resolve the published four-way row without claiming unobserved destinations.
 * Undecided allocation and split of aggregated invalid/abstention are assumptions. */
export function resolvePublishedRow(values: number[], nonvalidComposition: [number, number, number]): TransferRow {
  ensure(values.length === 4 && values.every((value) => Number.isFinite(value) && value >= 0), "Cruzamento inválido.");
  const [a, b, undecided, other] = values;
  const validShare = a + b > 0 ? a / (a + b) : 0.5;
  const compositionTotal = nonvalidComposition.reduce((sum, value) => sum + value, 0);
  ensure(compositionTotal > 0 && nonvalidComposition.every((value) => value >= 0), "Composição não válida inválida.");
  return normalized([a + undecided * validShare, b + undecided * (1 - validShare), other * nonvalidComposition[0] / compositionTotal, other * nonvalidComposition[1] / compositionTotal, other * nonvalidComposition[2] / compositionTotal]);
}

/** Iterative proportional fitting preserves source counts while reconciling all
 * five destination totals. A small explicit support floor avoids hard zeros from
 * rounded survey percentages being interpreted as impossible transitions. */
export function rakeGroups(groups: ForecastGroup[], targetRates: TransferRow, floor = 0.0001): ForecastGroup[] {
  ensure(groups.length > 0 && groups.every((group) => Number.isSafeInteger(group.count) && group.count >= 0), "Grupos inválidos.");
  const electorate = groups.reduce((sum, group) => sum + group.count, 0);
  if (electorate === 0) return groups.map((group) => ({ ...group, transfer: [...group.transfer] }));
  const targets = normalized(targetRates).map((rate) => rate * electorate);
  const rows = groups.map((group) => normalized(group.transfer.map((value) => Math.max(floor, value))).map((value) => value * group.count));
  for (let iteration = 0; iteration < 400; iteration++) {
    const sums = [0, 0, 0, 0, 0];
    for (const row of rows) for (let d = 0; d < 5; d++) sums[d] += row[d];
    for (let d = 0; d < 5; d++) {
      const factor = sums[d] > 0 ? targets[d] / sums[d] : 0;
      for (const row of rows) row[d] *= factor;
    }
    for (let index = 0; index < rows.length; index++) {
      const total = rows[index].reduce((a, b) => a + b, 0);
      if (total > 0) for (let d = 0; d < 5; d++) rows[index][d] *= groups[index].count / total;
    }
    if (iteration % 10 === 0) {
      const after = [0, 0, 0, 0, 0];
      for (const row of rows) for (let d = 0; d < 5; d++) after[d] += row[d];
      if (after.every((value, d) => Math.abs(value - targets[d]) / electorate < 1e-8)) break;
    }
  }
  const result = groups.map((group, index) => ({ ...group, transfer: group.count > 0 ? normalized(rows[index]) : [...group.transfer] as TransferRow }));
  const sums = expectedCounts(result);
  ensure(sums.every((value, d) => Math.abs(value - targets[d]) / electorate < 2e-6), "Raking não convergiu para os destinos propostos.");
  return result;
}
export function expectedCounts(groups: ForecastGroup[]): TransferRow {
  const result: TransferRow = [0, 0, 0, 0, 0];
  for (const group of groups) for (let d = 0; d < 5; d++) result[d] += group.count * group.transfer[d];
  return result;
}

function rates(territory: Territory): [number, number, number] {
  return territory.electorate > 0 ? [territory.blank / territory.electorate, territory.null / territory.electorate, territory.abstention / territory.electorate] : [0, 0, 0];
}
export function behaviorChange(base: Territory, previousFirst: Territory | undefined, previousSecond: Territory | undefined, fallbackFirst: Territory, fallbackSecond: Territory, shrinkElectors: number): [number, number, number] {
  const baseline = rates(base);
  const stateBefore = rates(fallbackFirst);
  const stateAfter = rates(fallbackSecond);
  let weight = 0;
  let before = stateBefore;
  let after = stateAfter;
  if (previousFirst && previousSecond) {
    weight = previousFirst.electorate / (previousFirst.electorate + shrinkElectors);
    before = rates(previousFirst); after = rates(previousSecond);
  }
  const adjusted = baseline.map((value, d) => clamp(value + weight * (after[d] - before[d]) + (1 - weight) * (stateAfter[d] - stateBefore[d]), 0.00001, 0.95));
  const nonvalidTotal = adjusted.reduce((a, b) => a + b, 0);
  return adjusted.map((value) => nonvalidTotal > 0.97 ? value * 0.97 / nonvalidTotal : value) as [number, number, number];
}

function rawGroups(city: Territory, request: ForecastRequest, composition: [number, number, number]): ForecastGroup[] {
  const defaults = request.assumptions.defaults;
  const { base, transfers } = request;
  const common = transfers.rows.find((row) => row.groupId === "others");
  const aggregateOther = Array.isArray(common?.values) ? resolvePublishedRow(common.values as number[], composition) : normalized([(1 - defaults.otherNonvalid) * defaults.otherValidShareA, (1 - defaults.otherNonvalid) * (1 - defaults.otherValidShareA), ...composition.map((value) => defaults.otherNonvalid * value / composition.reduce((a, b) => a + b, 0))]);
  const groups: ForecastGroup[] = base.candidates.map((candidate) => {
    const number = candidate.number;
    const role = number === "22" || number === "13" ? "own" as const : "other" as const;
    const groupId2026: Record<string, string> = { "22": "flavio", "13": "lula", "70": "cury", "14": "renan", "55": "caiado" };
    const observed = transfers.rows.find((row) => base.year === 2026 ? row.groupId === groupId2026[number] && groupId2026[number] != null : row.sourceCandidateNumber === number);
    let transfer: TransferRow;
    let origin: string;
    if (Array.isArray(observed?.values)) {
      transfer = resolvePublishedRow(observed.values as number[], composition);
      origin = "Cruzamento publicado; indecisos e destino agregado divididos por hipótese";
    } else if (Array.isArray(observed?.validShares) && typeof observed.blankNullTotal === "number" && typeof observed.undecidedTotal === "number") {
      const shares = observed.validShares as number[];
      const blankNull = observed.blankNullTotal;
      const undecided = observed.undecidedTotal;
      const valid = 100 - blankNull - undecided;
      transfer = resolvePublishedRow([valid * shares[0] / 100, valid * shares[1] / 100, undecided, blankNull], composition);
      origin = "Cruzamento histórico publicado; destinos não identificados são hipóteses";
    } else if (role === "own") {
      const nonvalid = 1 - defaults.ownStay - defaults.ownCross;
      const other = composition.map((value) => nonvalid * value / composition.reduce((a, b) => a + b, 0));
      transfer = normalized([number === "22" ? defaults.ownStay : defaults.ownCross, number === "13" ? defaults.ownStay : defaults.ownCross, ...other]);
      origin = "Hipótese simétrica de retenção: cruzamento não localizado";
    } else {
      transfer = [...aggregateOther];
      origin = common ? "Agregado outros como fallback; não é linha individual observada" : "Hipótese conservadora simétrica para origem não identificada";
    }
    return { id: `candidate:${number}`, name: candidate.name, role, count: city.votes[number] ?? 0, transfer, origin, ...(observed ? { observed } : {}) };
  });
  const invalidReturn = defaults.invalidReturn;
  const abstentionReturn = defaults.abstentionReturn;
  const nonvalid = composition.reduce((a, b) => a + b, 0);
  const rowForReturn = (returnRate: number) => normalized([returnRate / 2, returnRate / 2, (1 - returnRate) * composition[0] / nonvalid, (1 - returnRate) * composition[1] / nonvalid, (1 - returnRate) * composition[2] / nonvalid]);
  const bnObserved = transfers.rows.find((row) => row.groupId === "bn_abs");
  const bnRow = Array.isArray(bnObserved?.values) ? resolvePublishedRow(bnObserved.values as number[], composition) : rowForReturn(invalidReturn);
  groups.push(
    { id: "first:blank", name: "Brancos no primeiro turno", role: "invalid", count: city.blank, transfer: bnRow, origin: bnObserved ? "Agregado branco/nulo/abstenção aplicado como hipótese à origem branco" : "Retorno aos válidos assumido" },
    { id: "first:null", name: "Nulos no primeiro turno", role: "invalid", count: city.null, transfer: [...bnRow], origin: bnObserved ? "Agregado branco/nulo/abstenção aplicado como hipótese à origem nulo" : "Retorno aos válidos assumido" },
    { id: "first:abstention", name: "Abstenção no primeiro turno", role: "inactive", count: city.abstention, transfer: rowForReturn(abstentionReturn), origin: "Retorno assumido; cruzamento de respondentes não identifica todos os abstencionistas" },
    { id: "first:not-installed", name: "Seções não instaladas no primeiro turno", role: "uninstalled", count: city.notInstalledElectorate ?? 0, transfer: rowForReturn(defaults.notInstalledReturn), origin: "Origem observada separada; todos os destinos futuros são hipóteses, não abstenção observada" },
  );
  if ((city.annulledSeparate ?? 0) > 0) groups.push({ id: "first:annulled", name: "Votos anulados em separado", role: "invalid", count: city.annulledSeparate!, transfer: rowForReturn(invalidReturn), origin: "Origem separada, transferência assumida" });
  ensure(groups.reduce((sum, group) => sum + group.count, 0) === city.electorate, `${city.id}: origens não fecham com eleitorado oficial.`);
  return groups;
}

export function buildConditionalInput(request: ForecastRequest) {
  const { base, historyFirst, historySecond, assumptions } = request;
  ensure(base.round === 1 && historyFirst.round === 1 && historySecond.round === 2 && historyFirst.year === historySecond.year && historySecond.year < base.year, "Variação comportamental precisa vir de uma eleição anterior, nunca do resultado previsto.");
  ensure(request.targetShare > 0 && request.targetShare < 1, "Alvo nacional inválido.");
  ensure(base.candidates.some((candidate) => candidate.number === "22") && base.candidates.some((candidate) => candidate.number === "13"), "Identidade dos finalistas não corresponde às origens.");
  const previousFirst = new Map(historyFirst.cities.map((city) => [city.id, city]));
  const previousSecond = new Map(historySecond.cities.map((city) => [city.id, city]));
  const firstStates = new Map(historyFirst.states.map((state) => [state.uf, state]));
  const secondStates = new Map(historySecond.states.map((state) => [state.uf, state]));
  const composition = [historySecond.national.blank, historySecond.national.null, historySecond.national.abstention] as [number, number, number];
  const preliminary = base.cities.map((city): ForecastCity => {
    ensure(REGION[city.uf], `UF desconhecida ${city.uf}.`);
    const groups = rawGroups(city, request, composition);
    const initial = expectedCounts(groups);
    const validShare = initial[0] + initial[1] > 0 ? initial[0] / (initial[0] + initial[1]) : 0.5;
    const [blank, invalid, abstention] = behaviorChange(city, previousFirst.get(city.id), previousSecond.get(city.id), firstStates.get(city.uf) ?? historyFirst.national, secondStates.get(city.uf) ?? historySecond.national, assumptions.defaults.behaviorShrinkElectors);
    const valid = 1 - blank - invalid - abstention;
    return { id: city.id, state: city.uf, region: REGION[city.uf], electorate: city.electorate, groups: rakeGroups(groups, [valid * validShare, valid * (1 - validShare), blank, invalid, abstention], assumptions.defaults.rowFloor) };
  });
  const before = preliminary.map((city) => expectedCounts(city.groups));
  const shares = before.map((counts) => counts[0] + counts[1] > 0 ? counts[0] / (counts[0] + counts[1]) : 0.5);
  const weights = before.map((counts) => counts[0] + counts[1]);
  const calibrated = request.variant === "ecological" ? shares : calibrateShares(shares, weights, request.targetShare);
  const cities = preliminary.map((city, index) => {
    if (city.electorate === 0) return city;
    const counts = before[index];
    const valid = counts[0] + counts[1];
    const target = [calibrated[index] * valid, (1 - calibrated[index]) * valid, counts[2], counts[3], counts[4]].map((value) => value / city.electorate) as TransferRow;
    return { ...city, groups: rakeGroups(city.groups, target, assumptions.defaults.rowFloor) };
  });
  const eligibleErrors = request.historicalErrors.errors.filter((error) => error.year < base.year);
  ensure(eligibleErrors.length > 0, "Faltam erros nacionais de eleições anteriores.");
  const historicalRmse = Math.sqrt(eligibleErrors.reduce((sum, error) => sum + error.errorLogit ** 2, 0) / eligibleErrors.length);
  const uncertainty = {
    national: Math.hypot(historicalRmse, assumptions.uncertainty.nationalStructural),
    regional: assumptions.uncertainty.regional, city: assumptions.uncertainty.city,
    turnout: assumptions.uncertainty.turnout, invalid: assumptions.uncertainty.invalid,
  };
  const provenance = {
    label: `Projeção condicional de ${base.year} · probabilidades dependem das premissas, cobertura não validada`,
    assumptionsVersion: assumptions.version,
    sources: [`TSE primeiro turno ${base.year}`, `TSE primeiro e segundo turnos ${historySecond.year}`, ...request.pollSources, request.transfers.sourceUrl ?? "Cruzamentos publicados arquivados em dados/"],
    limitations: [...assumptions.rules, `Escala nacional usa somente eleições anteriores: ${eligibleErrors.map((error) => error.year).join(", ")}; RMSE ${historicalRmse}. Componentes adicionais são assumidos.`, "Pesquisa parcial e registros TSE ainda não conferidos diretamente; não representa todas as pesquisas disponíveis.", "Sem pesquisas estaduais verificadas, estados e cidades dependem da transferência e da calibração nacional; não há calibração regional observada."],
  };
  const input: ConditionalInput = { scenario: "conditional", seed: request.seed ?? 20261024, simulations: request.simulations ?? 20000, cities, uncertainty, provenance };
  const flows = summarizeFlows(cities);
  const other = flows.filter((flow) => flow.role === "other");
  const otherA = other.reduce((sum, flow) => sum + flow.destinations.flavio, 0);
  const otherB = other.reduce((sum, flow) => sum + flow.destinations.lula, 0);
  const controlDefaults: ControlDefaults = { otherTransferPct: 100 * otherA / (otherA + otherB), abstentionDeltaPp: 0, biasCorrection: 0, firstRoundBiasLogit: request.firstRoundBiasLogit ?? 0 };
  return { input, flows, controlDefaults, calibration: { applied: request.variant !== "ecological", targetShare: request.targetShare, behaviorReferenceYear: historySecond.year, historicalErrorYears: eligibleErrors.map((error) => error.year), historicalRmseLogit: historicalRmse, historicalDegreesFreedom: eligibleErrors.length - 1, nationalStructuralAssumption: assumptions.uncertainty.nationalStructural, varianceCombination: "hypot(historical RMSE, assumed independent structural SD)", uncertainty } };
}

export function summarizeFlows(cities: ForecastCity[]) {
  const bySource = new Map<string, { source: string; name: string; role: ForecastGroup["role"]; count: number; destinations: Record<typeof FIELDS[number], number>; origin: string; observed?: unknown }>();
  for (const city of cities) for (const group of city.groups) {
    if (!bySource.has(group.id)) bySource.set(group.id, { source: group.id, name: group.name, role: group.role, count: 0, destinations: { flavio: 0, lula: 0, blank: 0, null: 0, abstention: 0 }, origin: group.origin, ...(group.observed ? { observed: group.observed } : {}) });
    const flow = bySource.get(group.id)!;
    flow.count += group.count;
    for (let d = 0; d < 5; d++) flow.destinations[FIELDS[d]] += group.count * group.transfer[d];
  }
  return [...bySource.values()];
}

/** Browser-safe controls operate on the already calibrated base, so changing a
 * transfer is not silently cancelled by recalibrating back to a fixed poll mean. */
export function applyScenarioControls(input: ConditionalInput, defaults: ControlDefaults, controls: Controls): ConditionalInput {
  ensure(input.scenario === "conditional", "Controles exigem uma base condicional.");
  ensure(Number.isFinite(controls.otherTransferPct) && controls.otherTransferPct > 0 && controls.otherTransferPct < 100 && Number.isFinite(controls.abstentionDeltaPp) && Math.abs(controls.abstentionDeltaPp) <= 20 && Number.isFinite(controls.biasCorrection) && controls.biasCorrection >= 0 && controls.biasCorrection <= 1, "Controle fora dos limites.");
  const otherShift = logit(controls.otherTransferPct / 100) - logit(defaults.otherTransferPct / 100);
  return { ...input, cities: input.cities.map((city) => ({ ...city, groups: city.groups.map((group) => {
    const row = [...group.transfer] as TransferRow;
    const valid = row[0] + row[1];
    if (valid > 0) {
      let aShare = row[0] / valid;
      const override = controls.groupShares?.[group.id];
      if (override != null) { ensure(Number.isFinite(override) && override >= 0 && override <= 1, "Transferência individual inválida."); aShare = override; }
      aShare = logistic(logit(aShare) + (group.role === "other" ? otherShift : 0) + controls.biasCorrection * defaults.firstRoundBiasLogit);
      row[0] = valid * aShare; row[1] = valid * (1 - aShare);
    }
    if (controls.abstentionDeltaPp !== 0) {
      const abstention = clamp(row[4] + controls.abstentionDeltaPp / 100, 0.00001, 0.99999);
      const factor = (1 - abstention) / Math.max(1e-12, 1 - row[4]);
      for (let d = 0; d < 4; d++) row[d] *= factor;
      row[4] = abstention;
    }
    return { ...group, transfer: normalized(row) };
  }) })) };
}

export function expectedProjection(cities: ForecastCity[]) {
  const totals = [0, 0, 0, 0, 0];
  const states = new Map<string, { id: string; electorate: number; counts: number[] }>();
  for (const city of cities) {
    const counts = expectedCounts(city.groups);
    if (!states.has(city.state)) states.set(city.state, { id: city.state, electorate: 0, counts: [0, 0, 0, 0, 0] });
    const state = states.get(city.state)!;
    state.electorate += city.electorate;
    for (let d = 0; d < 5; d++) { totals[d] += counts[d]; state.counts[d] += counts[d]; }
  }
  const summary = (id: string, counts: number[]) => ({ id, share: counts[0] / (counts[0] + counts[1]), counts: Object.fromEntries(FIELDS.map((field, d) => [field, counts[d]])) });
  return { national: summary("BR", totals), states: [...states.values()].map((state) => summary(state.id, state.counts)) };
}

/** Runtime call uses exactly the same module as the browser Web Worker. */
export function executeConditional(input: ConditionalInput, onProgress?: (progress: number) => void) {
  return runSimulation(input, onProgress);
}

export function roundProjectedCounts(electorate: number, counts: number[]) { return allocateIntegers(electorate, counts); }

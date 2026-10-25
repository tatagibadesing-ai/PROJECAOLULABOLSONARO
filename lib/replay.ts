/** Real first-round municipal totals replayed in a simulated sequence. This is not
 * an election-night time series, a second-round projection, or a coverage backtest. */
export const REPLAY_ORDERS = ["state", "timezone", "totalization"] as const;
export type ReplayOrder = typeof REPLAY_ORDERS[number];
export interface ReplayCandidate { number: string; name: string; party: string; votes: number }
export interface ReplayLocation {
  id: string;
  uf: string;
  name: string;
  electorate: number;
  valid: number;
  abstention: number;
  blank: number;
  null: number;
  notInstalledElectorate: number;
  votes: Record<string, number>;
  lastTotalizationAt: string;
}
export interface ReplaySource {
  year: number;
  round: number;
  electionId: string | number;
  generatedAt: string;
  source: unknown;
  candidates: ReplayCandidate[];
  national: ReplayLocation;
  states: ReplayLocation[];
  cities: ReplayLocation[];
}
const FIELDS = ["electorate", "valid", "abstention", "blank", "null", "notInstalledElectorate"] as const;
type TotalField = typeof FIELDS[number];
type Totals = Record<TotalField, number> & { votes: Record<string, number> };
export interface PreparedReplay {
  source: ReplaySource;
  ordered: Record<ReplayOrder, ReplayLocation[]>;
  stateLocationCounts: Map<string, number>;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function emptyTotals(candidates: ReplayCandidate[]): Totals {
  return { electorate: 0, valid: 0, abstention: 0, blank: 0, null: 0, notInstalledElectorate: 0, votes: Object.fromEntries(candidates.map((candidate) => [candidate.number, 0])) };
}
function add(total: Totals, city: ReplayLocation, candidates: ReplayCandidate[]) {
  for (const field of FIELDS) total[field] += city[field];
  for (const candidate of candidates) total.votes[candidate.number] += city.votes[candidate.number];
}
function candidateCounts(totals: Totals, candidates: ReplayCandidate[]) {
  return candidates.map((candidate) => ({
    number: candidate.number, name: candidate.name, party: candidate.party,
    votes: totals.votes[candidate.number],
    percent: totals.valid === 0 ? null : totals.votes[candidate.number] / totals.valid * 100,
  }));
}
// A UF is only a timezone approximation (notably Amazonas). Exterior contains
// multiple countries and is kept in a separate, last block, never assigned a fake offset.
const UTC_OFFSET: Record<string, number> = { AC: -5, AM: -4, RO: -4, RR: -4, MT: -4, MS: -4, ZZ: 0 };
function offset(uf: string) { return UTC_OFFSET[uf] ?? -3; }

/** Validate and sort once; the API retains this immutable prepared input in memory. */
export function prepareReplay(source: ReplaySource): PreparedReplay {
  ensure(source.year === 2026 && source.round === 1, "Ensaio exige o primeiro turno de 2026, não o segundo turno.");
  ensure(Array.isArray(source.cities) && source.cities.length > 0, "Base municipal ausente.");
  ensure(source.candidates.length >= 2 && new Set(source.candidates.map((candidate) => candidate.number)).size === source.candidates.length, "Candidatos ausentes ou duplicados.");
  const totals = emptyTotals(source.candidates);
  const stateTotals = new Map<string, Totals>();
  const stateLocationCounts = new Map<string, number>();
  const ids = new Set<string>();
  for (const city of source.cities) {
    ensure(city.id && !ids.has(city.id), "Localidade duplicada.");
    ids.add(city.id);
    for (const field of FIELDS) ensure(Number.isSafeInteger(city[field]) && city[field] >= 0, `${city.id}: ${field} inválido.`);
    let valid = 0;
    for (const candidate of source.candidates) {
      const votes = city.votes[candidate.number];
      ensure(Number.isSafeInteger(votes) && votes >= 0, `${city.id}: votos inválidos.`);
      valid += votes;
    }
    ensure(valid === city.valid, `${city.id}: candidatos não fecham com votos válidos.`);
    ensure(city.valid + city.blank + city.null + city.abstention + city.notInstalledElectorate === city.electorate, `${city.id}: conservação do eleitorado falhou.`);
    ensure(Number.isFinite(Date.parse(city.lastTotalizationAt)), `${city.id}: horário final de totalização ausente.`);
    add(totals, city, source.candidates);
    if (!stateTotals.has(city.uf)) stateTotals.set(city.uf, emptyTotals(source.candidates));
    add(stateTotals.get(city.uf)!, city, source.candidates);
    stateLocationCounts.set(city.uf, (stateLocationCounts.get(city.uf) ?? 0) + 1);
  }
  for (const field of FIELDS) ensure(totals[field] === source.national[field], `Total nacional divergente: ${field}.`);
  for (const candidate of source.candidates) ensure(totals.votes[candidate.number] === source.national.votes[candidate.number], `Total nacional divergente do candidato ${candidate.number}.`);
  ensure(source.states.length === stateTotals.size, "Circunscrições não correspondem à base municipal.");
  const seenStates = new Set<string>();
  for (const state of source.states) {
    ensure(!seenStates.has(state.uf), "UF duplicada.");
    seenStates.add(state.uf);
    const summed = stateTotals.get(state.uf);
    ensure(summed, `UF sem localidades: ${state.uf}.`);
    for (const field of FIELDS) ensure(summed[field] === state[field], `UF ${state.uf} divergente: ${field}.`);
    for (const candidate of source.candidates) ensure(summed.votes[candidate.number] === state.votes[candidate.number], `UF ${state.uf}: candidato ${candidate.number} divergente.`);
  }
  const byState = (a: ReplayLocation, b: ReplayLocation) => a.uf.localeCompare(b.uf) || a.id.localeCompare(b.id);
  return {
    source,
    stateLocationCounts,
    ordered: {
      state: [...source.cities].sort(byState),
      timezone: [...source.cities].sort((a, b) => offset(a.uf) - offset(b.uf) || byState(a, b)),
      totalization: [...source.cities].sort((a, b) => Date.parse(a.lastTotalizationAt) - Date.parse(b.lastTotalizationAt) || a.id.localeCompare(b.id)),
    },
  };
}

export function replayAt(prepared: PreparedReplay, step: number, order: ReplayOrder = "totalization") {
  ensure(Number.isInteger(step) && step >= 0 && step <= 100, "Etapa deve ser inteira entre 0 e 100.");
  ensure(REPLAY_ORDERS.includes(order), "Ordem de ensaio inválida.");
  const { source } = prepared;
  const locations = prepared.ordered[order];
  const countedLocations = step === 100 ? locations.length : Math.floor(locations.length * step / 100);
  const totals = emptyTotals(source.candidates);
  const states = source.states.map((state) => ({
    id: state.id, uf: state.uf, name: state.name,
    ...emptyTotals(source.candidates),
    countedLocations: 0,
    totalLocations: prepared.stateLocationCounts.get(state.uf) ?? 0,
  }));
  const byUf = new Map(states.map((state) => [state.uf, state]));
  for (let index = 0; index < countedLocations; index++) {
    const city = locations[index];
    add(totals, city, source.candidates);
    const state = byUf.get(city.uf)!;
    add(state, city, source.candidates);
    state.countedLocations++;
  }
  return {
    kind: "replay" as const,
    label: "Reprodução do 1º turno · sequência simulada",
    year: 2026, round: 1,
    electionId: source.electionId,
    step, order,
    complete: countedLocations === locations.length,
    sourceGeneratedAt: source.generatedAt,
    progress: { countedLocations, totalLocations: locations.length, percent: countedLocations / locations.length * 100 },
    sequenceNote: order === "totalization"
      ? "Ordem dos horários finais municipais publicados pelo TSE. Cada localidade entra inteira: não reconstitui boletins parciais ou seções."
      : order === "timezone"
        ? "Sequência simulada por fuso aproximado da UF; Amazonas tem mais de um fuso. Exterior forma bloco separado. Não representa a ordem observada de apuração."
        : "Sequência simulada agrupada por UF. Não representa a ordem observada de apuração.",
    data: { ...totals, candidates: candidateCounts(totals, source.candidates), states: states.map((state) => ({ ...state, candidates: candidateCounts(state, source.candidates) })) },
    expectedFinal: { ...source.national, candidates: candidateCounts(source.national, source.candidates) },
    statisticalEstimate: null,
    intervalCoverage: null,
    disclaimer: "Dados reais do primeiro turno em sequência simulada; não é apuração ao vivo, projeção do segundo turno nem validação da cobertura estatística de 80%.",
  };
}

export function buildReplay(source: ReplaySource, step: number, order: ReplayOrder = "totalization") {
  return replayAt(prepareReplay(source), step, order);
}
export type ReplayFrame = ReturnType<typeof replayAt>;

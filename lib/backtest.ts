/** Retrospective scoring, kept separate from model fitting to prevent tuning on 2022. */
export interface ActualTerritory {
  id: string;
  uf?: string;
  name?: string;
  valid: number;
  votes: Record<string, number>;
}
export interface ActualElection {
  year: number;
  round: number;
  national: ActualTerritory;
  states: ActualTerritory[];
}
export interface TerritoryProjection {
  id: string;
  candidateAShare: number;
  interval80: [number, number] | null;
}
export interface BacktestProjection {
  label: string;
  year: number;
  candidateNumbers: [string, string];
  national: TerritoryProjection;
  states: TerritoryProjection[];
}
export interface TerritoryScore {
  id: string;
  projectedShare: number;
  actualShare: number;
  shareErrorPp: number;
  marginErrorPp: number;
  interval80: [number, number] | null;
  insideInterval80: boolean | null;
}
export interface BacktestScore {
  label: string;
  year: number;
  candidateNumbers: [string, string];
  national: TerritoryScore;
  states: TerritoryScore[];
  stateMeanAbsoluteErrorPp: number | null;
  stateMeanAbsoluteMarginErrorPp: number | null;
  intervalCoverage: { inside: number; tested: number; totalStates: number; fraction: number | null };
  missingStates: string[];
  complete27States: boolean;
  note: string;
}
export const BRAZIL_STATES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function share(value: number, field: string) {
  ensure(Number.isFinite(value) && value >= 0 && value <= 1, `${field}: proporção fora de [0,1].`);
  return value;
}

function scoreTerritory(actual: ActualTerritory, projection: TerritoryProjection, candidates: [string, string]): TerritoryScore {
  ensure(actual && projection && actual.id === projection.id, "Território real e projetado não correspondem.");
  const a = actual.votes[candidates[0]];
  const b = actual.votes[candidates[1]];
  ensure(Number.isSafeInteger(a) && a >= 0 && Number.isSafeInteger(b) && b >= 0, "Votos reais inválidos.");
  ensure(a + b > 0 && a + b === actual.valid, "Votos dos dois candidatos não fecham com os válidos.");
  const projectedShare = share(projection.candidateAShare, "Projeção");
  const actualShare = a / actual.valid;
  const interval = projection.interval80;
  if (interval != null) {
    ensure(Array.isArray(interval) && interval.length === 2, "Intervalo precisa de dois limites.");
    share(interval[0], "Limite inferior");
    share(interval[1], "Limite superior");
    ensure(interval[0] <= interval[1], "Intervalo invertido.");
  }
  return {
    id: actual.id, projectedShare, actualShare,
    shareErrorPp: (projectedShare - actualShare) * 100,
    marginErrorPp: (projectedShare - actualShare) * 200,
    interval80: interval,
    insideInterval80: interval == null ? null : actualShare >= interval[0] && actualShare <= interval[1],
  };
}

/** Pure scorer: computes errors only; does not certify the inputs or tune a model.
 * National totals must include exterior. Exterior is excluded only from state MAE. */
export function scoreBacktest(actual: ActualElection, projection: BacktestProjection): BacktestScore {
  ensure(actual.year === projection.year && actual.round === 2, "Retrospecto precisa do segundo turno do mesmo ano.");
  ensure(projection.candidateNumbers.length === 2 && projection.candidateNumbers[0] !== projection.candidateNumbers[1], "Dois candidatos distintos são obrigatórios.");
  const seen = new Set<string>();
  for (const state of projection.states) {
    ensure(!seen.has(state.id), "UF projetada duplicada.");
    ensure(BRAZIL_STATES.includes(state.id) || state.id === "ZZ", "UF projetada desconhecida.");
    seen.add(state.id);
  }
  const actualSeen = new Set<string>();
  for (const state of actual.states) {
    const id = state.uf ?? state.id;
    ensure(!actualSeen.has(id), "UF real duplicada.");
    actualSeen.add(id);
  }
  const states: TerritoryScore[] = [];
  const missingStates: string[] = [];
  for (const uf of BRAZIL_STATES) {
    const observation = actual.states.find((state) => (state.uf ?? state.id) === uf);
    const forecast = projection.states.find((state) => state.id === uf);
    if (!observation || !forecast) {
      missingStates.push(uf);
      continue;
    }
    states.push(scoreTerritory({ ...observation, id: uf }, forecast, projection.candidateNumbers));
  }
  const intervals = states.filter((state) => state.insideInterval80 != null);
  const inside = intervals.filter((state) => state.insideInterval80).length;
  return {
    label: projection.label,
    year: projection.year,
    candidateNumbers: projection.candidateNumbers,
    national: scoreTerritory({ ...actual.national, id: "BR" }, { ...projection.national, id: "BR" }, projection.candidateNumbers),
    states,
    stateMeanAbsoluteErrorPp: states.length ? states.reduce((sum, state) => sum + Math.abs(state.shareErrorPp), 0) / states.length : null,
    stateMeanAbsoluteMarginErrorPp: states.length ? states.reduce((sum, state) => sum + Math.abs(state.marginErrorPp), 0) / states.length : null,
    intervalCoverage: { inside, tested: intervals.length, totalStates: 27, fraction: intervals.length ? inside / intervals.length : null },
    missingStates,
    complete27States: states.length === 27,
    note: "Erro em pontos percentuais; MAE de participação e de margem são distintos. Cobertura inclui somente estados com intervalo. Este cálculo não certifica dados, premissas nem independência temporal.",
  };
}

export function compareBacktestVariants(actual: ActualElection, baseline: BacktestProjection, corrected: BacktestProjection) {
  ensure(baseline.candidateNumbers.join() === corrected.candidateNumbers.join(), "Variantes precisam da mesma ordem de candidatos.");
  ensure(baseline.states.map((state) => state.id).sort().join() === corrected.states.map((state) => state.id).sort().join(), "Variantes precisam dos mesmos estados.");
  const pollOnly = scoreBacktest(actual, baseline);
  const withCorrection = scoreBacktest(actual, corrected);
  return {
    pollOnly,
    withCorrection,
    nationalCorrectionImproved: Math.abs(withCorrection.national.marginErrorPp) < Math.abs(pollOnly.national.marginErrorPp),
    nationalAbsoluteMarginErrorChangePp: Math.abs(withCorrection.national.marginErrorPp) - Math.abs(pollOnly.national.marginErrorPp),
    stateMeanAbsoluteErrorChangePp: withCorrection.stateMeanAbsoluteErrorPp == null || pollOnly.stateMeanAbsoluteErrorPp == null ? null : withCorrection.stateMeanAbsoluteErrorPp - pollOnly.stateMeanAbsoluteErrorPp,
    note: "Valores negativos de mudança significam redução do erro. Uma melhora isolada em 2022 não valida a correção nem autoriza ajustar parâmetros usando o resultado.",
  };
}

export interface BacktestReadiness {
  officialFirstRoundVerified: boolean;
  officialSecondRoundVerified: boolean;
  electionDayPollsVerified: boolean;
  transferMatrixEvidence: boolean;
  historicalErrorEstimateVerified: boolean;
  inputsCutoff: string | null;
  pollsOnlyProjectionAvailable: boolean;
  correctedProjectionAvailable: boolean;
}

/** All prerequisites stay explicit. A real-result file alone is never a backtest. */
export function assessBacktestReadiness(input: BacktestReadiness) {
  const blockers: string[] = [];
  if (!input.officialFirstRoundVerified) blockers.push("Primeiro turno de 2022 ainda não reconciliado com o TSE.");
  if (!input.officialSecondRoundVerified) blockers.push("Segundo turno de 2022 ainda não reconciliado com o TSE.");
  if (!input.electionDayPollsVerified) blockers.push("Conjunto de pesquisas de véspera de 2022 ainda incompleto ou sem comprovação documental suficiente para o retrospecto.");
  if (!input.transferMatrixEvidence) blockers.push("Matriz de transferência de 2022 sem cruzamentos verificados.");
  if (!input.historicalErrorEstimateVerified) blockers.push("Calibração da incerteza nacional, regional e municipal ainda insuficiente para uma projeção publicável; uma estimativa nacional exploratória não a substitui.");
  const cutoff = input.inputsCutoff == null ? Number.NaN : new Date(input.inputsCutoff).getTime();
  if (!Number.isFinite(cutoff) || cutoff >= Date.parse("2022-10-30T20:00:00Z")) blockers.push("Corte temporal das entradas não estabelecido antes da divulgação de 2022.");
  if (!input.pollsOnlyProjectionAvailable) blockers.push("Versão sem correção ainda não executada com entradas verificadas.");
  if (!input.correctedProjectionAvailable) blockers.push("Versão com correção ainda não executada com entradas verificadas.");
  return { status: blockers.length ? "blocked" as const : "eligible-for-scoring" as const, blockers };
}

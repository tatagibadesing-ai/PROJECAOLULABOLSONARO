/** Conditional nowcast, isolated from official votes and from the frozen projection.
 * It uses projected VALID VOTE totals, never section percentages. Its interval has
 * not passed empirical coverage testing and must not be labelled a validated 80% interval.
 */
export interface LiveEstimateUnit {
  id: string;
  uf: string;
  projectedValidVotes: number;
  projectedFlavioShare: number;
  interval80: [number, number];
  countedFlavio: number;
  countedLula: number;
  final: boolean;
}
export interface LiveEstimateTotals {
  flavioShare: number | null;
  interval80: [number, number] | null;
  flavioVotes: number;
  lulaVotes: number;
  countedValidVotes: number;
  remainingEstimatedValidVotes: number;
}
export interface LiveEstimate {
  conditional: true;
  coverageValidated: false;
  granularity: "state" | "municipal";
  status: "conditional" | "unavailable" | "completed";
  national: LiveEstimateTotals | null;
  units: Array<LiveEstimateTotals & { id: string; uf: string; correctionLogit: number }>;
  warnings: string[];
  method: string;
}
const EPSILON = 1e-6;
const clamp = (value: number) => Math.min(1 - EPSILON, Math.max(EPSILON, value));
const logit = (value: number) => Math.log(clamp(value) / (1 - clamp(value)));
const logistic = (value: number) => value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value));
function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function validate(units: LiveEstimateUnit[], priorVotes: number) {
  ensure(units.length > 0, "A estimativa exige ao menos uma localidade.");
  ensure(Number.isFinite(priorVotes) && priorVotes > 0, "Regularização inválida.");
  const ids = new Set<string>();
  for (const unit of units) {
    ensure(typeof unit.id === "string" && unit.id.length > 0 && !ids.has(unit.id), "Localidade ausente ou duplicada.");
    ids.add(unit.id);
    ensure(/^[A-Z]{2}$/.test(unit.uf), "UF inválida.");
    ensure(Number.isFinite(unit.projectedValidVotes) && unit.projectedValidVotes >= 0, "Votos válidos projetados inválidos.");
    ensure(Number.isFinite(unit.projectedFlavioShare) && unit.projectedFlavioShare >= 0 && unit.projectedFlavioShare <= 1, "Proporção projetada inválida.");
    // A central quantile interval need not contain the mean of a skewed distribution.
    ensure(Array.isArray(unit.interval80) && unit.interval80.length === 2 && unit.interval80.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) && unit.interval80[0] <= unit.interval80[1], "Intervalo projetado inválido.");
    ensure([unit.countedFlavio, unit.countedLula].every((value) => Number.isSafeInteger(value) && value >= 0), "Votos contados inválidos.");
    ensure(typeof unit.final === "boolean", "Estado de totalização inválido.");
  }
}

export function estimateLive(input: {
  units: LiveEstimateUnit[];
  granularity?: "state" | "municipal";
  poolPriorVotes?: number;
}): LiveEstimate {
  const priorVotes = input.poolPriorVotes ?? 5_000;
  validate(input.units, priorVotes);
  const warnings = [
    "Estimativa condicional: os votos restantes são estimados pelo modelo; não são contagem divulgada pelo TSE.",
    "Intervalo condicional de referência de 80%; cobertura em apuração real ainda não validada.",
  ];
  const method = "Votos contados + válidos restantes estimados × proporção projetada corrigida na escala logística. Desvio local regularizado e compartilhado apenas com localidades semelhantes da mesma UF. A incerteza é reduzida pela fração de votos projetados ainda não contados; não usa porcentagem de seções.";
  if ((input.granularity ?? "state") === "state") warnings.push("Agregação por UF: o viés da ordem de apuração dentro de cada estado não é identificado. Não equivale a um modelo municipal validado.");
  const exceeded = input.units.filter((unit) => !unit.final && unit.countedFlavio + unit.countedLula >= unit.projectedValidVotes && unit.countedFlavio + unit.countedLula > 0);
  if (exceeded.length) return {
    conditional: true, coverageValidated: false, granularity: input.granularity ?? "state", status: "unavailable", national: null, units: [], method,
    warnings: [...warnings, `Votos contados atingiram ou excederam o total válido projetado sem totalização final (${exceeded.map((unit) => unit.id).join(", ")}). O restante não pode ser inferido com essa premissa.`],
  };
  const grouped = new Map<string, LiveEstimateUnit[]>();
  for (const unit of input.units) grouped.set(unit.uf, [...(grouped.get(unit.uf) ?? []), unit]);
  const observations = new Map(input.units.map((unit) => {
    const n = unit.countedFlavio + unit.countedLula;
    // Jeffreys smoothing makes the logit finite even for one-sided partial counts.
    return [unit.id, { n, delta: n === 0 ? 0 : logit((unit.countedFlavio + 0.5) / (n + 1)) - logit(unit.projectedFlavioShare) }];
  }));
  const units = input.units.map((unit) => {
    const observation = observations.get(unit.id)!;
    const n = observation.n;
    let peerSum = 0, peerWeight = 0;
    for (const peer of grouped.get(unit.uf)!) {
      if (peer.id === unit.id) continue;
      const other = observations.get(peer.id)!;
      // Similarity depends only on pre-count projection and size; no cross-state leakage.
      const similarity = Math.exp(-Math.abs(logit(peer.projectedFlavioShare) - logit(unit.projectedFlavioShare))) /
        (1 + Math.abs(Math.log(Math.max(1, peer.projectedValidVotes) / Math.max(1, unit.projectedValidVotes))));
      const weight = other.n * similarity;
      peerSum += other.delta * weight; peerWeight += weight;
    }
    const ownWeight = n / (n + priorVotes);
    const peerDelta = peerWeight === 0 ? 0 : peerSum / (peerWeight + priorVotes);
    const correctionLogit = ownWeight * observation.delta + (1 - ownWeight) * peerDelta;
    const remaining = unit.final ? 0 : Math.max(0, unit.projectedValidVotes - n);
    const expected = logistic(logit(unit.projectedFlavioShare) + correctionLogit);
    const total = n + remaining;
    const flavioVotes = unit.countedFlavio + remaining * expected;
    const lulaVotes = unit.countedLula + remaining * (1 - expected);
    const shrink = Math.sqrt(priorVotes / (priorVotes + n + peerWeight));
    const loLogit = logit(unit.projectedFlavioShare) + correctionLogit + (logit(unit.interval80[0]) - logit(unit.projectedFlavioShare)) * shrink;
    const hiLogit = logit(unit.projectedFlavioShare) + correctionLogit + (logit(unit.interval80[1]) - logit(unit.projectedFlavioShare)) * shrink;
    return {
      id: unit.id, uf: unit.uf, correctionLogit,
      flavioVotes, lulaVotes, countedValidVotes: n, remainingEstimatedValidVotes: remaining,
      flavioShare: total === 0 ? null : flavioVotes / total,
      interval80: total === 0 ? null : [
        (unit.countedFlavio + remaining * logistic(loLogit)) / total,
        (unit.countedFlavio + remaining * logistic(hiLogit)) / total,
      ] as [number, number],
    };
  });
  const countedValidVotes = units.reduce((n, unit) => n + unit.countedValidVotes, 0);
  const remainingEstimatedValidVotes = units.reduce((n, unit) => n + unit.remainingEstimatedValidVotes, 0);
  const total = countedValidVotes + remainingEstimatedValidVotes;
  const flavioVotes = units.reduce((n, unit) => n + unit.flavioVotes, 0);
  const lulaVotes = units.reduce((n, unit) => n + unit.lulaVotes, 0);
  // Sum bounds, retaining a common-direction national error rather than pretending independence.
  const bound = (index: 0 | 1) => units.reduce((n, unit) => n + (unit.interval80?.[index] ?? 0) * (unit.countedValidVotes + unit.remainingEstimatedValidVotes), 0) / total;
  return {
    conditional: true, coverageValidated: false, granularity: input.granularity ?? "state",
    status: input.units.every((unit) => unit.final) ? "completed" : "conditional",
    national: { flavioShare: total === 0 ? null : flavioVotes / total, interval80: total === 0 ? null : [bound(0), bound(1)], flavioVotes, lulaVotes, countedValidVotes, remainingEstimatedValidVotes },
    units, warnings, method,
  };
}

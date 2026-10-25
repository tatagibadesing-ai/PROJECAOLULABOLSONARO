import test from "node:test";
import assert from "node:assert/strict";
import { BRAZIL_STATES, assessBacktestReadiness, compareBacktestVariants, scoreBacktest, type ActualElection, type BacktestProjection } from "./backtest";

// Test fixtures deliberately synthetic. These assertions do not claim historical accuracy.
const actual: ActualElection = { year: 2022, round: 2, national: { id: "BR", valid: 10000, votes: { "22": 4900, "13": 5100 } }, states: BRAZIL_STATES.map((uf) => ({ id: uf, uf, valid: 1000, votes: { "22": 480, "13": 520 } })).concat([{ id: "ZZ", uf: "ZZ", valid: 1, votes: { "22": 1, "13": 0 } }]) };
const projection: BacktestProjection = { label: "fixture sintética", year: 2022, candidateNumbers: ["22", "13"], national: { id: "BR", candidateAShare: 0.5, interval80: [0.47, 0.53] }, states: BRAZIL_STATES.map((id) => ({ id, candidateAShare: 0.5, interval80: [0.47, 0.53] })) };

test("retrospecto distingue erro de participação e de margem, com 27 UFs e exterior fora do MAE", () => {
  const result = scoreBacktest(actual, projection);
  assert.ok(Math.abs(result.national.shareErrorPp - 1) < 1e-10);
  assert.ok(Math.abs(result.national.marginErrorPp - 2) < 1e-10);
  assert.ok(Math.abs(result.stateMeanAbsoluteErrorPp! - 2) < 1e-10);
  assert.ok(Math.abs(result.stateMeanAbsoluteMarginErrorPp! - 4) < 1e-10);
  assert.equal(result.complete27States, true);
  assert.equal(result.intervalCoverage.tested, 27);
  assert.equal(result.intervalCoverage.inside, 27);
  assert.equal(result.intervalCoverage.fraction, 1);
  assert.ok(result.states.every((state) => state.id !== "ZZ"));
});

test("UF ausente e intervalo ausente não são aprovados por silêncio", () => {
  const result = scoreBacktest(actual, { ...projection, states: projection.states.filter((state) => state.id !== "AC").map((state) => ({ ...state, interval80: null })) });
  assert.deepEqual(result.missingStates, ["AC"]);
  assert.equal(result.complete27States, false);
  assert.equal(result.intervalCoverage.tested, 0);
  assert.equal(result.intervalCoverage.fraction, null);
});

test("comparação de correção mede melhora sem confundir sinal", () => {
  const corrected: BacktestProjection = { ...projection, label: "fixture corrigida", national: { ...projection.national, candidateAShare: 0.51 } };
  const result = compareBacktestVariants(actual, projection, corrected);
  assert.equal(result.nationalCorrectionImproved, false);
  assert.ok(Math.abs(result.nationalAbsoluteMarginErrorChangePp - 2) < 1e-10);
});

test("dados reais malformados, intervalos invertidos e ordem de candidatos incompatível falham", () => {
  assert.throws(() => scoreBacktest({ ...actual, national: { ...actual.national, valid: 1 } }, projection), /não fecham/);
  assert.throws(() => scoreBacktest(actual, { ...projection, national: { ...projection.national, interval80: [0.6, 0.4] } }), /invertido/);
  assert.throws(() => compareBacktestVariants(actual, projection, { ...projection, candidateNumbers: ["13", "22"] }), /mesma ordem/);
  assert.throws(() => scoreBacktest(actual, { ...projection, states: [...projection.states, projection.states[0]] }), /duplicada/);
});

test("resultado observado isolado não desbloqueia retrospecto, nem corte temporal posterior", () => {
  const missing = assessBacktestReadiness({ officialFirstRoundVerified: true, officialSecondRoundVerified: true, electionDayPollsVerified: false, transferMatrixEvidence: false, historicalErrorEstimateVerified: false, inputsCutoff: null, pollsOnlyProjectionAvailable: false, correctedProjectionAvailable: false });
  assert.equal(missing.status, "blocked");
  assert.equal(missing.blockers.length, 6);
  const full = { officialFirstRoundVerified: true, officialSecondRoundVerified: true, electionDayPollsVerified: true, transferMatrixEvidence: true, historicalErrorEstimateVerified: true, inputsCutoff: "2022-10-29T23:59:59Z", pollsOnlyProjectionAvailable: true, correctedProjectionAvailable: true };
  assert.equal(assessBacktestReadiness(full).status, "eligible-for-scoring");
  assert.equal(assessBacktestReadiness({ ...full, inputsCutoff: "2022-10-30T20:00:00Z" }).status, "blocked");
});

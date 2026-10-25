import test from "node:test";
import assert from "node:assert/strict";
import { allocateIntegers, calibrateShares, runSimulation, weightedPollAverage, type ModelCity, type Poll, type SimulationInput } from "./model";

const cities: ModelCity[] = [
  { id: "ensaio-01", state: "UF-A", region: "region-1", electorate: 10003, groups: [
    { id: "first", count: 4000, transfer: [0.8, 0.1, 0.02, 0.03, 0.05] },
    { id: "second", count: 4000, transfer: [0.1, 0.8, 0.02, 0.03, 0.05] },
    { id: "others", count: 2003, transfer: [0.3, 0.25, 0.05, 0.05, 0.35] },
  ] },
  { id: "ensaio-02", state: "UF-A", region: "region-1", electorate: 7, groups: [
    { id: "all", count: 7, transfer: [0.3, 0.3, 0.1, 0.1, 0.2] },
  ] },
  { id: "ensaio-03", state: "UF-B", region: "region-2", electorate: 3559, groups: [
    { id: "all", count: 3559, transfer: [0.3, 0.4, 0.02, 0.03, 0.25] },
  ] },
  { id: "ensaio-exterior", state: "ZZ", region: "exterior", electorate: 0, groups: [
    { id: "all", count: 0, transfer: [0.3, 0.4, 0.02, 0.03, 0.25] },
  ] },
];
const scenario: SimulationInput = { scenario: "synthetic", seed: 12345, cities, uncertainty: { national: 0.07, regional: 0.06, city: 0.04, turnout: 0.1, invalid: 0.1 } };

test("20.000 sorteios preservam eleitorado e não negatividade em cada município, estado e total", () => {
  const progress: number[] = [];
  const result = runSimulation(scenario, (value) => progress.push(value));
  assert.equal(result.simulations, 20000);
  assert.equal(result.audit.drawsChecked, cities.length * 20000);
  assert.equal(result.audit.violations, 0);
  assert.equal(result.audit.minCount, 0);
  assert.equal(result.audit.electorate, 13569);
  assert.equal(result.national.electorate, 13569);
  assert.equal(result.label.includes("sintético"), true);
  assert.equal(result.uncertainty.estimatedFromHistory, false);
  assert.equal(progress.at(-1), 1);
  assert.equal(result.histogram.reduce((sum, bin) => sum + bin.count, 0), 20000);
  for (const summary of [result.national, ...result.states, ...result.cities]) {
    assert.ok(Object.values(summary.counts).every((count) => count >= 0));
    assert.ok(Math.abs(Object.values(summary.counts).reduce((a, b) => a + b, 0) - summary.electorate) < 1e-8);
    assert.ok(Math.abs(summary.flavio.winProbability + summary.lula.winProbability + summary.tieProbability - 1) < 1e-12);
    if (summary.flavio.share != null) {
      assert.ok(summary.flavio.share >= 0 && summary.flavio.share <= 1);
      assert.ok(Math.abs(summary.flavio.share + summary.lula.share! - 1) < 1e-12);
      assert.ok(summary.flavio.interval![0] >= 0 && summary.flavio.interval![1] <= 1);
      assert.equal(summary.lula.interval![0], 1 - summary.flavio.interval![1]);
    }
  }
  assert.equal(result.cities.find((city) => city.id === "ensaio-exterior")!.flavio.share, null);
  for (const destination of ["flavio", "lula", "blank", "null", "abstention"] as const) {
    const stateSum = result.states.reduce((sum, state) => sum + state.counts[destination], 0);
    const citySum = result.cities.reduce((sum, city) => sum + city.counts[destination], 0);
    assert.ok(Math.abs(stateSum - result.national.counts[destination]) < 1e-8);
    assert.ok(Math.abs(citySum - result.national.counts[destination]) < 1e-8);
  }
});

test("semente reproduzível e parâmetros alteram cenários", () => {
  const first = runSimulation({ ...scenario, simulations: 300 });
  const second = runSimulation({ ...scenario, simulations: 300 });
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.national, runSimulation({ ...scenario, simulations: 300, seed: 12346 }).national);
  const alternative = runSimulation({ ...scenario, simulations: 300, targetShare: 0.6 });
  assert.ok(alternative.national.flavio.share! > first.national.flavio.share!);
});

test("erros regionais compartilhados produzem o mesmo sorteio para municípios idênticos", () => {
  const city: ModelCity = { id: "a", state: "UF-A", region: "same", electorate: 100000, groups: [{ id: "all", count: 100000, transfer: [0.4, 0.4, 0.05, 0.05, 0.1] }] };
  const result = runSimulation({ scenario: "synthetic", simulations: 1000, seed: 1, cities: [city, { ...city, id: "b", state: "UF-B" }, { ...city, id: "c", state: "UF-C", region: "different" }], uncertainty: { national: 0, regional: 0.3, city: 0 } });
  assert.deepEqual(result.cities[0].flavio, result.cities[1].flavio);
  assert.notDeepEqual(result.cities[0].flavio, result.cities[2].flavio);
});

test("calibração é logística, ponderada e limitada a [0,1]", () => {
  const shares = [0.25, 0.5, 0.8];
  const weights = [100, 200, 50];
  const calibrated = calibrateShares(shares, weights, 0.62);
  assert.ok(Math.abs(calibrated.reduce((sum, share, i) => sum + share * weights[i], 0) / 350 - 0.62) < 1e-12);
  const shifts = calibrated.map((value, i) => Math.log(value / (1 - value)) - Math.log(shares[i] / (1 - shares[i])));
  assert.ok(Math.max(...shifts) - Math.min(...shifts) < 1e-12);
  for (const target of [0, 1, 0.01, 0.99]) {
    const output = calibrateShares([0, 1, 0.5], weights, target);
    assert.ok(output.every((share) => share >= 0 && share <= 1));
    assert.ok(Math.abs(output.reduce((sum, share, i) => sum + share * weights[i], 0) / 350 - target) < 1e-10);
  }
  assert.throws(() => calibrateShares([0.5], [0], 0.5), /sem votos válidos/);
  assert.throws(() => calibrateShares([0.5], [1], 1.1), /entre 0 e 1/);
});

test("maiores restos preservam totais pequenos, grandes e zeros sem favorecimento variável", () => {
  assert.deepEqual(allocateIntegers(7, [1, 1, 1, 1, 1]), [2, 2, 1, 1, 1]);
  assert.deepEqual(allocateIntegers(0, [0, 0, 0]), [0, 0, 0]);
  for (let total = 0; total < 200; total++) {
    const output = allocateIntegers(total, [0.33, 0.33, 0.02, 0.02, 0.3]);
    assert.equal(output.reduce((sum, count) => sum + count, 0), total);
    assert.ok(output.every((count) => Number.isInteger(count) && count >= 0));
  }
  assert.equal(allocateIntegers(158745502, [0.33, 0.33, 0.02, 0.02, 0.3]).reduce((sum, value) => sum + value, 0), 158745502);
  assert.throws(() => allocateIntegers(1, [0, 0]), /pesos positivos/);
  assert.throws(() => allocateIntegers(1, [-1, 2]), /Peso negativo/);
});

test("empates exatos de arredondamento não privilegiam um candidato em todos os sorteios", () => {
  let first = 0;
  let second = 0;
  for (let seed = 0; seed < 10000; seed++) {
    const counts = allocateIntegers(1, [0.5, 0.5, 0, 0, 0], seed);
    first += counts[0];
    second += counts[1];
    assert.equal(counts.reduce((a, b) => a + b, 0), 1);
  }
  assert.equal(first + second, 10000);
  assert.ok(first > 4800 && first < 5200);
  assert.deepEqual(allocateIntegers(1, [0.5, 0.5, 0, 0, 0], 123), allocateIntegers(1, [0.5, 0.5, 0, 0, 0], 123));
});

test("média usa amostra e recência sem aceitar registros não verificados ou denominadores incompatíveis", () => {
  const poll: Poll = { registration: "BR-TEST", fieldEnd: "2026-10-24T00:00:00Z", sampleSize: 1000, denominator: "valid", flavioShare: 0.52, verified: true };
  const result = weightedPollAverage([poll, { ...poll, registration: "BR-OLD", fieldEnd: "2026-10-19T00:00:00Z", sampleSize: 4000, flavioShare: 0.48 }, { ...poll, registration: "BR-UNVERIFIED", verified: false }, { ...poll, registration: "BR-TOTAL", denominator: "total" }, { ...poll, registration: "BR-FUTURE", fieldEnd: "2026-10-25" }, { ...poll, registration: "BR-BIAS", houseBias: 0.02 }], "2026-10-24T00:00:00Z");
  assert.equal(result.included.length, 2);
  assert.equal(result.excluded.length, 4);
  assert.ok(Math.abs(result.included[0].normalizedWeight - 0.5) < 1e-12);
  assert.ok(Math.abs(result.flavioShare! - 0.5) < 1e-12);
  assert.equal(weightedPollAverage([], "2026-10-24").flavioShare, null);
  const corrected = weightedPollAverage([{ ...poll, houseBias: 0.01, biasEvidence: "fixture histórica sintética" }], "2026-10-24");
  assert.equal(corrected.flavioShare, 0.51);
});

test("inputs inválidos e publicação indevida são bloqueados", () => {
  assert.throws(() => runSimulation({ ...scenario, scenario: "official" } as unknown as SimulationInput), /apenas para cenários sintéticos/);
  assert.throws(() => runSimulation({ ...scenario, simulations: 0 }), /Número de simulações/);
  assert.throws(() => runSimulation({ ...scenario, cities: [cities[0], cities[0]] }), /duplicado/);
  assert.throws(() => runSimulation({ ...scenario, cities: [{ ...cities[0], electorate: 1 }] }), /não fecham/);
  assert.throws(() => runSimulation({ ...scenario, uncertainty: { national: Number.NaN } }), /finito/);
  assert.throws(() => runSimulation({ ...scenario, cities: [{ ...cities[0], groups: [{ id: "bad", count: 10003, transfer: [1, 1, 1, 1, 1] }] }] }), /somar 1/);
});

test("ausência de votos válidos não vira projeção artificial de 50%", () => {
  const result = runSimulation({ scenario: "synthetic", simulations: 2, cities: [{ id: "no-votes", state: "ZZ", region: "exterior", electorate: 10, groups: [{ id: "all", count: 10, transfer: [0, 0, 0, 0, 1] }] }] });
  assert.equal(result.national.flavio.share, null);
  assert.equal(result.national.flavio.interval, null);
  assert.equal(result.national.counts.abstention, 10);
  assert.deepEqual(result.histogram, []);
});

test("cenário condicional exige fontes e premissas e nunca se certifica como publicável", () => {
  const provenance = { label: "Cenário condicional de teste, sem dados eleitorais", assumptionsVersion: "fixture-1", sources: ["fixture sintética de teste"], limitations: ["Não mede resultado ou cobertura eleitoral"] };
  const input: SimulationInput = { ...scenario, simulations: 100, scenario: "conditional", provenance };
  const result = runSimulation(input);
  assert.equal(result.scenario, "conditional");
  assert.equal(result.label, provenance.label);
  assert.deepEqual(result.provenance, provenance);
  assert.equal(result.publicationReady, false);
  assert.equal(result.coverageValidated, false);
  assert.equal(result.audit.conditional, true);
  assert.equal(result.audit.synthetic, false);
  assert.equal(result.audit.violations, 0);
  assert.throws(() => runSimulation({ ...input, provenance: undefined }), /proveniência/);
  assert.throws(() => runSimulation({ ...input, provenance: { ...provenance, sources: [] } }), /sources/);
  assert.throws(() => runSimulation({ ...input, provenance: { ...provenance, limitations: [""] } }), /limitations/);
  provenance.sources.push("mudança externa");
  assert.equal(result.provenance!.sources.length, 1);
});

test("contagens têm intervalos inteiros para os cinco destinos em Brasil, UFs e municípios", () => {
  const uncertain = runSimulation({ ...scenario, simulations: 2000 });
  for (const summary of [uncertain.national, ...uncertain.states, ...uncertain.cities]) {
    for (const destination of ["flavio", "lula", "blank", "null", "abstention"] as const) {
      const [low, high] = summary.countsInterval[destination];
      assert.ok(Number.isSafeInteger(low) && Number.isSafeInteger(high));
      assert.ok(low >= 0 && low <= high && high <= summary.electorate);
    }
  }
  assert.equal(uncertain.national.countsIntervalResolution, "exact");
  assert.ok(uncertain.national.countsInterval.abstention[1] > uncertain.national.countsInterval.abstention[0]);
  const point = runSimulation({ scenario: "synthetic", simulations: 100, cities: [{ id: "exact", state: "UF", region: "r", electorate: 100000, groups: [{ id: "all", count: 100000, transfer: [.25, .25, .1, .1, .3] }] }] });
  for (const summary of [point.national, point.states[0], point.cities[0]]) {
    assert.deepEqual(summary.countsInterval.flavio, [25000, 25000]);
    assert.deepEqual(summary.countsInterval.blank, [10000, 10000]);
    assert.deepEqual(summary.countsInterval.abstention, [30000, 30000]);
  }
  assert.equal(point.cities[0].countsIntervalResolution, 100);
  const absent = runSimulation({ scenario: "synthetic", simulations: 2, cities: [{ id: "empty", state: "ZZ", region: "exterior", electorate: 0, groups: [{ id: "all", count: 0, transfer: [.5, .5, 0, 0, 0] }] }] });
  for (const bounds of Object.values(absent.cities[0].countsInterval)) assert.deepEqual(bounds, [0, 0]);
});

test("o alocador otimizado do sorteio conserva totais e não favorece o primeiro destino em empates", () => {
  const input: SimulationInput = { scenario: "synthetic", seed: 981, simulations: 20000, cities: [{ id: "single", state: "UF", region: "r", electorate: 1, groups: [{ id: "all", count: 1, transfer: [.2, .2, .2, .2, .2] }] }] };
  const result = runSimulation(input);
  assert.equal(result.audit.drawsChecked, 20000);
  assert.equal(result.audit.violations, 0);
  for (const value of Object.values(result.national.counts)) assert.ok(value > .18 && value < .22);
  assert.equal(result.national.electorate, 1);
  assert.deepEqual(result, runSimulation(input));
});

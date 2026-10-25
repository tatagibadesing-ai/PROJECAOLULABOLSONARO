import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyScenarioControls, behaviorChange, buildConditionalInput, expectedCounts, expectedProjection, rakeGroups, resolvePublishedRow, type Assumptions, type ElectionData, type ForecastGroup, type ForecastRequest } from "./forecast";

const assumptions: Assumptions = JSON.parse(readFileSync(new URL("../dados/model-assumptions.json", import.meta.url), "utf8"));
function election(year: number, round: number): ElectionData {
  const cities = [
    { id: "SP-A", uf: "SP", name: "Cidade A", electorate: 10003, abstention: 2000, blank: 200, null: 300, notInstalledElectorate: 3, valid: 7500, votes: { "22": 3500, "13": 3000, "15": 1000 } },
    { id: "BA-B", uf: "BA", name: "Cidade B", electorate: 10000, abstention: 2100, blank: 200, null: 200, notInstalledElectorate: 0, valid: 7500, votes: { "22": 2500, "13": 4000, "15": 1000 } },
  ];
  const aggregate = { id: "BR", uf: "BR", name: "Brasil", electorate: 20003, abstention: 4100, blank: 400, null: 500, notInstalledElectorate: 3, valid: 15000, votes: { "22": 6000, "13": 7000, "15": 2000 } };
  return { year, round, source: "fixture sintética", candidates: [{ number: "22", name: "A", party: "A", votes: 6000 }, { number: "13", name: "B", party: "B", votes: 7000 }, { number: "15", name: "C", party: "C", votes: 2000 }], national: aggregate, states: cities.map((city) => ({ ...city, id: city.uf })), cities };
}
const request = (): ForecastRequest => ({ base: election(2022, 1), historyFirst: election(2018, 1), historySecond: election(2018, 2), assumptions, transfers: { sourceUrl: "https://example.org/fixture", rows: [{ sourceCandidateNumber: "15", validShares: [41, 59], blankNullTotal: 21, undecidedTotal: 7 }] }, historicalErrors: { errors: [{ year: 2014, errorLogit: 0.04 }, { year: 2018, errorLogit: 0.02 }, { year: 2022, errorLogit: 999 }] }, targetShare: 0.48, pollSources: ["https://example.org/poll"], simulations: 20 });

test("base oficial, origem não instalada e calibração nacional são conservadas sem declarar destino observado", () => {
  const built = buildConditionalInput(request());
  assert.equal(built.input.scenario, "conditional");
  assert.equal(built.input.cities.length, 2);
  const residual = built.flows.find((flow) => flow.source === "first:not-installed")!;
  assert.equal(residual.count, 3);
  assert.ok(residual.origin.includes("hipóteses"));
  for (const city of built.input.cities) {
    assert.equal(city.groups.reduce((sum, group) => sum + group.count, 0), city.electorate);
    for (const group of city.groups) {
      assert.ok(group.transfer.every((value) => value >= 0 && value <= 1));
      assert.ok(Math.abs(group.transfer.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    }
    assert.ok(Math.abs(expectedCounts(city.groups).reduce((a, b) => a + b, 0) - city.electorate) < 1e-8);
  }
  assert.ok(Math.abs(expectedProjection(built.input.cities).national.share - 0.48) < 2e-6);
});

test("retrospecto2022 exclui seu próprio erro e usa somente comportamento do pleito anterior", () => {
  const original = request();
  const first = buildConditionalInput(original);
  const changed = buildConditionalInput({ ...original, historicalErrors: { errors: [...original.historicalErrors.errors.slice(0, 2), { year: 2022, errorLogit: -999 }] } });
  assert.deepEqual(first.input, changed.input);
  assert.deepEqual(first.calibration.historicalErrorYears, [2014, 2018]);
  assert.equal(first.calibration.behaviorReferenceYear, 2018);
  assert.ok(Math.abs(first.calibration.historicalRmseLogit - Math.sqrt((0.04 ** 2 + 0.02 ** 2) / 2)) < 1e-12);
  assert.equal(first.calibration.nationalStructuralAssumption, 0.12);
  assert.throws(() => buildConditionalInput({ ...original, historyFirst: election(2022, 1), historySecond: election(2022, 2) }), /anterior/);
});

test("raking conserva cada origem e atinge todos os destinos sem negativos", () => {
  const groups: ForecastGroup[] = [{ id: "a", name: "A", role: "own", count: 400, transfer: [0.9, 0, 0.02, 0.03, 0.05], origin: "fixture" }, { id: "b", name: "B", role: "own", count: 600, transfer: [0, 0.9, 0.02, 0.03, 0.05], origin: "fixture" }];
  const target: [number, number, number, number, number] = [0.4, 0.35, 0.02, 0.03, 0.2];
  const output = rakeGroups(groups, target);
  const totals = expectedCounts(output);
  for (let d = 0; d < 5; d++) assert.ok(Math.abs(totals[d] / 1000 - target[d]) < 2e-6);
  assert.deepEqual(output.map((group) => group.count), [400, 600]);
});

test("indecisos e branco/nulo/abstenção são divisões assumidas explícitas, não dados observados", () => {
  const row = resolvePublishedRow([40, 40, 10, 10], [1, 1, 8]);
  assert.deepEqual(row, [0.45, 0.45, 0.01, 0.01, 0.08]);
  assert.throws(() => resolvePublishedRow([-1, 40, 10, 10], [1, 1, 8]), /inválido/);
});

test("controles respondem sem recalibração que apague premissas e preservam conservação", () => {
  const built = buildConditionalInput({ ...request(), firstRoundBiasLogit: 0.1 });
  const unchanged = applyScenarioControls(built.input, built.controlDefaults, built.controlDefaults);
  assert.ok(Math.abs(expectedProjection(unchanged.cities).national.share - expectedProjection(built.input.cities).national.share) < 1e-10);
  const moved = applyScenarioControls(built.input, built.controlDefaults, { ...built.controlDefaults, otherTransferPct: built.controlDefaults.otherTransferPct + 10 });
  assert.ok(expectedProjection(moved.cities).national.share > expectedProjection(built.input.cities).national.share);
  const abstention = applyScenarioControls(built.input, built.controlDefaults, { ...built.controlDefaults, abstentionDeltaPp: 2, groupShares: { "candidate:15": 0.6 } });
  assert.ok(expectedProjection(abstention.cities).national.counts.abstention > expectedProjection(built.input.cities).national.counts.abstention);
  for (const city of abstention.cities) assert.ok(Math.abs(expectedCounts(city.groups).reduce((a, b) => a + b, 0) - city.electorate) < 1e-8);
  assert.notDeepEqual(abstention, built.input);
});

test("mudança comportamental usa regularização por UF sem percentuais impossíveis", () => {
  const city = election(2022, 1).cities[0];
  const history = election(2018, 1).cities[0];
  const next = { ...history, abstention: history.abstention + 100 };
  const result = behaviorChange(city, history, next, history, next, 10000);
  assert.ok(Math.abs(result[2] - (city.abstention + 100) / city.electorate) < 1e-12);
});

import test from "node:test";
import assert from "node:assert/strict";
import { estimateLive, type LiveEstimateUnit } from "./live-estimate";

const unit = (changes: Partial<LiveEstimateUnit> = {}): LiveEstimateUnit => ({ id: "SP-a", uf: "SP", projectedValidVotes: 10_000, projectedFlavioShare: 0.5, interval80: [0.4, 0.6], countedFlavio: 0, countedLula: 0, final: false, ...changes });
test("before counting the nowcast equals the conditional projection and stays explicitly conditional", () => {
  const result = estimateLive({ units: [unit()] });
  assert.equal(result.status, "conditional"); assert.equal(result.conditional, true); assert.equal(result.coverageValidated, false);
  assert.equal(result.national?.flavioShare, 0.5);
  assert.deepEqual(result.national?.interval80, [0.4, 0.6]);
  assert.equal(result.national?.remainingEstimatedValidVotes, 10_000);
});
test("uses counted valid votes and projected remaining votes, preserving all counted votes", () => {
  const result = estimateLive({ units: [unit({ countedFlavio: 3000, countedLula: 1000 })] });
  assert.equal(result.national?.countedValidVotes, 4000);
  assert.equal(result.national?.remainingEstimatedValidVotes, 6000);
  assert.ok(result.national!.flavioVotes >= 3000); assert.ok(result.national!.lulaVotes >= 1000);
  assert.ok(Math.abs(result.national!.flavioVotes + result.national!.lulaVotes - 10_000) < 1e-8);
  assert.ok(result.national!.flavioShare! > 0.6);
});
test("same-state comparable municipalities share residual; other states do not", () => {
  const result = estimateLive({ granularity: "municipal", units: [
    unit({ countedFlavio: 3000, countedLula: 1000 }), unit({ id: "SP-b" }), unit({ id: "RJ-c", uf: "RJ" }),
  ] });
  assert.ok(result.units[1].correctionLogit > 0);
  assert.equal(result.units[2].correctionLogit, 0);
  assert.equal(result.units[2].flavioShare, 0.5);
});
test("uncertainty narrows during counting and final result exactly equals observed votes", () => {
  const width = (votes: number) => { const r = estimateLive({ units: [unit({ countedFlavio: votes, countedLula: votes })] }); return r.national!.interval80![1] - r.national!.interval80![0]; };
  assert.ok(width(1000) < width(0)); assert.ok(width(4000) < width(1000));
  const result = estimateLive({ units: [unit({ countedFlavio: 6234, countedLula: 5142, final: true })] });
  assert.equal(result.status, "completed"); assert.equal(result.national?.remainingEstimatedValidVotes, 0);
  assert.equal(result.national?.flavioVotes, 6234); assert.equal(result.national?.lulaVotes, 5142);
  assert.equal(result.national?.flavioShare, 6234 / (6234 + 5142));
  assert.equal(result.national?.interval80![0], result.national?.flavioShare);
  assert.equal(result.national?.interval80![1], result.national?.flavioShare);
});
test("exceeding projected turnout before finalization blocks estimation instead of inventing remaining votes", () => {
  const result = estimateLive({ units: [unit({ countedFlavio: 6000, countedLula: 5000 })] });
  assert.equal(result.status, "unavailable"); assert.equal(result.national, null); assert.match(result.warnings.join(" "), /excederam/);
});
test("finite at endpoint probabilities and zero valid final has no percentage", () => {
  for (const share of [0, 1]) {
    const result = estimateLive({ units: [unit({ projectedFlavioShare: share, interval80: [share, share], countedFlavio: 1 })] });
    assert.ok(Number.isFinite(result.national?.flavioShare));
  }
  const zero = estimateLive({ units: [unit({ projectedValidVotes: 0, final: true })] });
  assert.equal(zero.national?.flavioShare, null); assert.equal(zero.national?.interval80, null);
});
test("invalid counts, intervals, duplicate IDs and regularization are rejected", () => {
  for (const changes of [ { countedFlavio: -1 }, { countedLula: 0.5 }, { projectedFlavioShare: 2 }, { projectedValidVotes: -1 }, { interval80: [0.8, 0.7] as [number, number] } ]) {
    assert.throws(() => estimateLive({ units: [unit(changes)] }));
  }
  assert.throws(() => estimateLive({ units: [unit(), unit()] }));
  assert.throws(() => estimateLive({ units: [unit()], poolPriorVotes: 0 }));
});

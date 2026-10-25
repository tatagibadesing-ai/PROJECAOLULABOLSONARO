import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPLAY_ORDERS, buildReplay, prepareReplay, replayAt, type ReplaySource } from "./replay";

const source: ReplaySource = JSON.parse(readFileSync(new URL("../public/data/first-round-2026.json", import.meta.url), "utf8"));
const prepared = prepareReplay(source);

test("ensaio real de 2026 termina exatamente no total TSE em todas as ordens, com todos os candidatos", () => {
  for (const order of REPLAY_ORDERS) {
    const frame = replayAt(prepared, 100, order);
    assert.equal(frame.complete, true);
    assert.equal(frame.progress.countedLocations, source.cities.length);
    assert.equal(frame.progress.percent, 100);
    assert.equal(frame.data.candidates.length, source.candidates.length);
    for (const candidate of source.candidates) {
      assert.equal(frame.data.votes[candidate.number], source.national.votes[candidate.number]);
      assert.equal(frame.data.candidates.find((row) => row.number === candidate.number)!.votes, candidate.votes);
    }
    for (const field of ["electorate", "valid", "abstention", "blank", "null", "notInstalledElectorate"] as const) {
      assert.equal(frame.data[field], source.national[field]);
      assert.equal(frame.data.states.reduce((sum, state) => sum + state[field], 0), frame.data[field]);
    }
    for (const state of frame.data.states) {
      const official = source.states.find((row) => row.uf === state.uf)!;
      assert.deepEqual(state.votes, official.votes);
    }
    assert.equal(frame.statisticalEstimate, null);
    assert.equal(frame.intervalCoverage, null);
  }
});

test("ensaio começa sem votos e preserva conservação, monotonicidade e reprodutibilidade ao longo dos 101 pontos", () => {
  for (const order of REPLAY_ORDERS) {
    let previousValid = 0;
    let previousLocations = 0;
    for (let step = 0; step <= 100; step++) {
      const frame = replayAt(prepared, step, order);
      assert.ok(frame.data.valid >= previousValid);
      assert.ok(frame.progress.countedLocations >= previousLocations);
      assert.equal(frame.data.valid + frame.data.blank + frame.data.null + frame.data.abstention + frame.data.notInstalledElectorate, frame.data.electorate);
      assert.equal(frame.data.candidates.reduce((sum, candidate) => sum + candidate.votes, 0), frame.data.valid);
      assert.equal(frame.data.states.reduce((sum, state) => sum + state.valid, 0), frame.data.valid);
      previousValid = frame.data.valid;
      previousLocations = frame.progress.countedLocations;
    }
    const empty = replayAt(prepared, 0, order);
    assert.equal(empty.data.valid, 0);
    assert.equal(empty.data.candidates[0].percent, null);
    assert.deepEqual(replayAt(prepared, 57, order), replayAt(prepared, 57, order));
  }
});

test("ordens usam sequências distintas e totalização usa horários finais municipais verificáveis", () => {
  assert.notDeepEqual(prepared.ordered.state.map((city) => city.id), prepared.ordered.timezone.map((city) => city.id));
  assert.notDeepEqual(prepared.ordered.state.map((city) => city.id), prepared.ordered.totalization.map((city) => city.id));
  for (let index = 1; index < prepared.ordered.totalization.length; index++) {
    assert.ok(Date.parse(prepared.ordered.totalization[index].lastTotalizationAt) >= Date.parse(prepared.ordered.totalization[index - 1].lastTotalizationAt));
  }
});

test("ensaio rejeita etapa inválida, outro turno e total nacional divergente", () => {
  assert.throws(() => replayAt(prepared, -1), /Etapa/);
  assert.throws(() => replayAt(prepared, 100.1), /Etapa/);
  assert.throws(() => replayAt(prepared, 1, "fake" as never), /Ordem/);
  assert.throws(() => buildReplay({ ...source, round: 2 }, 1), /primeiro turno/);
  assert.throws(() => buildReplay({ ...source, national: { ...source.national, valid: source.national.valid + 1 } }, 1), /nacional divergente/);
});

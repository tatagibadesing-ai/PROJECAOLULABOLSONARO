import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCanFreeze, canonicalJson, snapshotHash, verifySnapshot } from './projection-snapshot';

const now = '2026-10-25T01:00:00.000Z';
const forecast = { scenario: 'conditional', simulations: 20000, generatedAt: '2026-10-25T00:59:00Z', publicationReady: false, cities: Array(5757).fill({}), audit: { violations: 0, drawsChecked: 115140000, electorate: 158745502 }, provenance: { sources: ['fonte de teste'], limitations: ['cenário de teste, não resultado'] } };
const live = { source: 'TSE', status: 'waiting', fetchedAt: now, data: { electionId: '6258', round: 2, sections: { total: 499248, counted: 0 }, candidates: [{ votes: 0 }, { votes: 0 }] } };

test('congelamento rejeita voto publicado, cache velho, prazo encerrado e substituição', () => {
  assert.doesNotThrow(() => assertCanFreeze({ now, existingFrozen: false, forecast, live }));
  assert.throws(() => assertCanFreeze({ now, existingFrozen: true, forecast, live }), /já está congelada/);
  assert.throws(() => assertCanFreeze({ now: '2026-10-25T20:00:00Z', existingFrozen: false, forecast, live }), /Prazo/);
  assert.throws(() => assertCanFreeze({ now, existingFrozen: false, forecast, live: { ...live, fetchedAt: '2026-10-25T00:59:00Z' } }), /consulta oficial nova/);
  assert.throws(() => assertCanFreeze({ now, existingFrozen: false, forecast, live: { ...live, data: { ...live.data, sections: { total: 499248, counted: 1 } } } }), /ausência de votos/);
});

test('hash canônico é independente da ordem de chaves e detecta alteração na projeção', () => {
  assert.equal(canonicalJson({ b: 1, a: [3, 2] }), canonicalJson({ a: [3, 2], b: 1 }));
  const snapshot = { status: 'frozen-conditional', frozen: true, generatedAt: now, projection: { votes: 100 }, sha256: null as string | null };
  snapshot.sha256 = snapshotHash(snapshot);
  assert.equal(verifySnapshot(snapshot).sha256, snapshot.sha256);
  assert.throws(() => verifySnapshot({ ...snapshot, projection: { votes: 101 } }), /hash/);
  assert.throws(() => canonicalJson({ number: Number.NaN }), /finito/);
});

test('uma demonstração sintética não passa pelo congelamento eleitoral', () => {
  assert.throws(() => assertCanFreeze({ now, existingFrozen: false, forecast: { ...forecast, scenario: 'synthetic' }, live }), /condicionais/);
  assert.throws(() => assertCanFreeze({ now, existingFrozen: false, forecast: { ...forecast, audit: { ...forecast.audit, violations: 1 } }, live }), /conservação/);
});

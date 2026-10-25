import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { presentProjectionSnapshot } from './projection-presentation';
import { verifySnapshot } from './projection-snapshot';
import { GET } from '../app/api/projecao/route';

const sourcePromise = readFile(new URL('../projecao-final.json', import.meta.url), 'utf8').then(JSON.parse);

test('API summary preserves all 5,757 frozen city estimates, counts and intervals below the Function cap', async () => {
  const source = await sourcePromise;
  const before = JSON.stringify(source);
  const summary = presentProjectionSnapshot(source);
  const projection = summary.projection as typeof source.projection;
  assert.equal(summary.representation, 'summary');
  assert.equal(summary.frozen, true);
  assert.equal(projection.cities.length, 5757);
  assert.equal(Object.hasOwn(projection, 'input'), false);
  for (let i = 0; i < projection.cities.length; i++) {
    const city = projection.cities[i];
    const original = source.projection.cities[i];
    for (const key of ['id', 'state', 'region', 'electorate', 'flavio', 'lula', 'counts', 'countsInterval', 'countsIntervalResolution', 'intervalResolution']) assert.deepEqual(city[key], original[key], `${city.id}: ${key}`);
    assert.equal(Object.hasOwn(city, 'firstRound'), false);
  }
  for (const field of ['national', 'states', 'histogram', 'provenance', 'flows', 'assumptions']) assert.deepEqual(projection[field], source.projection[field]);
  const bytes = Buffer.byteLength(JSON.stringify(summary));
  assert.ok(bytes < 4_500_000, `${bytes} bytes exceeds the serverless response budget`);
  assert.equal(JSON.stringify(source), before, 'presentation must not mutate the frozen source');
});

test('the hash explicitly belongs to the verified ORIGINAL, never to the derived representation', async () => {
  const source = await sourcePromise;
  const summary = presentProjectionSnapshot(source);
  assert.equal(summary.sha256, source.sha256);
  assert.equal(summary.canonicalSha256, source.sha256);
  assert.equal(summary.integrity.hashScope, 'original-frozen-snapshot');
  assert.equal(summary.integrity.appliesToSummary, false);
  assert.throws(() => verifySnapshot(summary), /hash/);
  const tampered = structuredClone(source);
  tampered.projection.cities[0].counts.flavio += 1;
  assert.throws(() => presentProjectionSnapshot(tampered), /hash/);
});

test('route serves a bounded summary and preserves metadata; Vercel download redirects to static original', async () => {
  const response = await GET(new Request('https://observatorio.example/api/projecao'));
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(Buffer.byteLength(text) < 4_500_000);
  assert.equal(JSON.parse(text).representation, 'summary');
  const metadata = await (await GET(new Request('https://observatorio.example/api/projecao?metadata=1'))).json();
  assert.equal(metadata.frozen, true);
  assert.equal(metadata.sha256, (await sourcePromise).sha256);
  assert.equal(Object.hasOwn(metadata, 'projection'), false);
  const previous = process.env.VERCEL;
  try {
    process.env.VERCEL = '1';
    const download = await GET(new Request('https://observatorio.example/api/projecao?download=1'));
    assert.equal(download.status, 307);
    assert.equal(download.headers.get('Location'), 'https://observatorio.example/projecao-final.json');
    assert.equal(await download.text(), '');
  } finally { if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous; }
});

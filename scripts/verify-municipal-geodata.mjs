import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = relative => JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
const base = read('public/data/first-round-2026.json');
const expected = new Set(base.cities.filter(c => c.uf !== 'ZZ').map(c => c.id));
const report = read('dados/municipal-geodata.json');
const crosswalk = read('dados/municipal-crosswalk.json');
assert.equal(crosswalk.municipalities.length, expected.size);
const pairs = new Map(crosswalk.municipalities.map(c => [c.id, c]));
assert.equal(new Set(crosswalk.municipalities.map(c => c.ibgeCode)).size, expected.size);
const national = read('public/data/municipalities/BR.json');
assert.equal(national.features.length, expected.size);
assert.equal(new Set(national.features.map(f => f.properties.id)).size, expected.size);
assert.deepEqual(new Set(national.features.map(f => f.properties.id)), expected);
const states = new Map();
for (const feature of national.features) {
  const p = feature.properties, pair = pairs.get(p.id);
  assert(pair, `No official TSE-IBGE correspondence: ${p.id}`);
  assert.equal(p.ibgeCode, pair.ibgeCode);
  assert.equal(p.uf, pair.uf);
  assert.equal(p.match, 'official-code-crosswalk');
  assert(['Polygon', 'MultiPolygon'].includes(feature.geometry.type));
  let count = 0;
  const verifyCoordinates = coordinates => {
    if (typeof coordinates[0] === 'number') {
      const [lon, lat] = coordinates;
      assert(Number.isFinite(lon) && Number.isFinite(lat));
      assert(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90);
      count++;
    } else for (const coordinate of coordinates) verifyCoordinates(coordinate);
  };
  verifyCoordinates(feature.geometry.coordinates);
  assert(count >= 4, `Missing municipal polygon: ${p.id}`);
  if (!states.has(p.uf)) states.set(p.uf, []);
  states.get(p.uf).push(p.id);
}
for (const [uf, ids] of states) {
  const subset = read(`public/data/municipalities/${uf}.json`);
  assert.equal(subset.sourceYear, 2025);
  assert.equal(subset.coverage.matched, ids.length);
  assert.equal(subset.coverage.unmatched, 0);
  assert.deepEqual(new Set(subset.features.map(f => f.properties.id)), new Set(ids));
}
for (const output of report.outputs) {
  const bytes = readFileSync(path.join(root, output.path));
  assert.equal(bytes.byteLength, output.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), output.sha256);
}
for (const source of report.sources) if (existsSync(path.join(root, source.path))) {
  assert.equal(createHash('sha256').update(readFileSync(path.join(root, source.path))).digest('hex'), source.sha256);
}
const boa = national.features.find(f => f.properties.id === 'MT-73709');
assert.equal(boa?.properties.ibgeCode, '5101837');
assert.equal(report.excludedOperationalAreas.length, 2);
console.log(`Municipal cartography: ${expected.size} official TSE↔IBGE code matches, ${states.size} states, all polygons and SHA-256 checks passed.`);

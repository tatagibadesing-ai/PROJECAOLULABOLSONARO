import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, createPublicKey, verify } from 'node:crypto';

const root = new URL('../', import.meta.url);
const load = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const fields = ['electorate', 'abstention', 'blank', 'null', 'valid', 'turnout', 'notInstalledElectorate', 'sections'];
let territories = 0;

for (const file of ['first-round-2026.json', 'round-1-2022.json', 'round-2-2022.json']) {
  const data = await load(`public/data/${file}`);
  assert.equal(new Set(data.cities.map(x => x.id)).size, data.cities.length, `${file}: IDs repetidos`);
  assert.equal(data.states.length, 28, `${file}: 27 UFs + exterior`);
  for (const place of [data.national, ...data.states, ...data.cities]) {
    for (const field of fields) assert(Number.isSafeInteger(place[field]) && place[field] >= 0, `${place.id}: ${field}`);
    assert.equal(Object.values(place.votes).reduce((a, b) => a + b, 0), place.valid, `${place.id}: válidos`);
    assert.equal(place.valid + place.blank + place.null, place.turnout, `${place.id}: comparecimento`);
    assert.equal(place.turnout + place.abstention + place.notInstalledElectorate, place.electorate, `${place.id}: eleitorado`);
    territories++;
  }
  for (const parent of [data.national, ...data.states]) {
    const children = parent.id === 'BR' ? data.states : data.cities.filter(x => x.uf === parent.uf);
    for (const field of fields) assert.equal(children.reduce((sum, x) => sum + x[field], 0), parent[field], `${file}:${parent.id}:${field}`);
    for (const number of Object.keys(parent.votes)) assert.equal(children.reduce((sum, x) => sum + (x.votes[number] ?? 0), 0), parent.votes[number], `${file}:${parent.id}:candidato ${number}`);
  }
  console.log(`${file}: ${data.cities.length} localidades, 28 circunscrições, somas exatas.`);
}

const first = await load('public/data/first-round-2026.json');
const jws = (await readFile(new URL('dados/originais/tse-6257.jws', root), 'utf8')).trim();
const parts = jws.split('.');
assert.equal(parts.length, 3);
const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
assert.equal(header.alg, 'EdDSA');
assert.equal(header.kid, 'sNbt9Q_fLS65zE1_ZLNV-XRRwPY');
const key = createPublicKey({ format: 'jwk', key: { kty: 'OKP', crv: 'Ed25519', x: 'kWlpNHjuws1csyQZwzn3Fhzbi3RD435RbpThtSr4hMc' } });
assert(verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url')), 'Assinatura do TSE inválida');
const official = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
assert.equal(String(official.ele), '6257');
assert.equal(String(official.t), '1');
const candidates = official.carg.flatMap(cargo => cargo.agr.flatMap(group => group.par.flatMap(party => party.cand)));
for (const candidate of candidates) assert.equal(first.national.votes[candidate.n], Number(candidate.vap), `Dados abertos × JWS: ${candidate.n}`);
assert.equal(first.national.sections, Number(official.s.ts), 'Denominador de seções deve excluir agregadas');
assert.equal(first.national.electorate, Number(official.e.te));
assert.equal(first.national.abstention, Number(official.e.a));
assert.equal(first.national.notInstalledElectorate, Number(official.e.esni));
assert.equal(first.national.blank, Number(official.v.vb));
assert.equal(first.national.null, Number(official.v.tvn));
const hash = createHash('sha256').update(await readFile(new URL('public/data/first-round-2026.json', root))).digest('hex');
console.log(`Dados Abertos × divulgação assinada: ${candidates.length} candidatos, nenhuma divergência; ${territories} territórios verificados.`);
console.log(`SHA-256 primeiro turno normalizado: ${hash}`);

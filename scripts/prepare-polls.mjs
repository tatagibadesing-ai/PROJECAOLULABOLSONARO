import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const evidence = JSON.parse(await readFile(new URL('dados/pesquisas-evidencias.json', root), 'utf8'));
const asOf = new Date().toISOString();
const polls = evidence.polls.filter(p => p.year === 2026 && p.round === 2 && p.scope === 'BR');
// This is deliberately NOT the publication gate in weightedPollAverage: the direct
// TSE registration check is unavailable, so this derivative is clearly provisional.
for (const poll of polls) {
  if (!['primary-publication', 'primary-publication-by-poll-sponsor'].includes(poll.verification) || !poll.sourceUrl || !poll.sha256) throw new Error(`Evidência incompleta: ${poll.id}`);
  const bytes = await readFile(new URL(poll.sourceFile, root));
  if (createHash('sha256').update(bytes).digest('hex') !== poll.sha256) throw new Error(`Hash divergente: ${poll.id}`);
}
// A poll published during its last field day is already observable. Do not wait
// until 23:59 to include it; when supplied, publication time is the availability gate.
const eligible = polls.filter(p => p.denominator === 'valid' && p.sample > 0
  && new Date(`${p.fieldEnd}T00:00:00-03:00`) <= new Date(asOf)
  && (!p.publicationMetadata?.datePublished || new Date(p.publicationMetadata.datePublished) <= new Date(asOf)));
let weight = 0, weighted = 0;
for (const poll of eligible) {
  const age = Math.max(0, (Date.parse(asOf) - Date.parse(`${poll.fieldEnd}T23:59:59-03:00`)) / 86400000);
  const w = Math.sqrt(poll.sample) * 2 ** (-age / 5);
  weight += w;
  weighted += w * poll.candidates[0].percent;
}
const output = {
  status: 'partial', asOf, scope: evidence.scope, registrationStatus: evidence.registrationStatus,
  average: weight ? { flavio: weighted / weight, lula: 100 - weighted / weight, count: eligible.length, label: 'Média parcial de publicações localizadas', method: 'sqrt(amostra) × 2^(−idade/5); apenas votos válidos publicados; sem ajuste de instituto; não é a série completa nem uma projeção.' } : null,
  polls: polls.map(p => ({ ...p, includedInPartialAverage: eligible.some(e => e.id === p.id) })),
  missing: evidence.missing,
};
await mkdir(new URL('public/data/', root), { recursive: true });
await writeFile(new URL('public/data/polls.json', root), JSON.stringify(output, null, 2) + '\n');
console.log(`Publicações 2026: ${polls.length}; média parcial em válidos: ${eligible.length}; registro TSE não confirmado.`);

#!/usr/bin/env node
import { readFile, writeFile, open, rename, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertCanFreeze, FREEZE_DEADLINE, snapshotHash, verifySnapshot } from '../lib/projection-snapshot.ts';
import { createApuracaoService, OFFICIAL_2026_CONFIG } from '../lib/apuracao.ts';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const lockPath = path.join(root, '.freeze-projection.lock');
const finalPath = path.join(root, 'projecao-final.json');
const temporaryPath = path.join(root, '.projecao-final.tmp');
let lock;
try {
  lock = await open(lockPath, 'wx');
  const old = verifySnapshot(JSON.parse(await readFile(finalPath, 'utf8')));
  if (old.frozen) throw new Error('O arquivo já foi congelado. Nenhuma alteração foi feita.');
  const projectionPath = path.join(root, 'public/data/projection-conditional.json');
  const bytes = await readFile(projectionPath);
  const projection = JSON.parse(bytes);
  if (!projection.inputHashes?.length) throw new Error('O cenário não contém hashes de entrada.');
  for (const item of projection.inputHashes) {
    const resolved = await realpath(path.resolve(root, item.path));
    if (!resolved.startsWith(root + path.sep)) throw new Error('Entrada fora do projeto.');
    const digest = createHash('sha256').update(await readFile(resolved)).digest('hex');
    if (digest !== item.sha256) throw new Error(`Entrada mudou depois da simulação: ${item.path}. Gere novamente antes de congelar.`);
  }
  const methodSha256 = createHash('sha256').update(await readFile(path.join(root, 'METODO.md'))).digest('hex');
  // A new, nonpersistent collector is intentional: a disk or HMR cache cannot
  // establish that no votes have been published since the last observation.
  const live = await createApuracaoService({ config: { ...OFFICIAL_2026_CONFIG }, collectStates: false }).get();
  const generatedAt = new Date().toISOString();
  assertCanFreeze({ now: generatedAt, existingFrozen: old.frozen, forecast: projection, live });
  const snapshot = {
    schemaVersion: 2, status: 'frozen-conditional', frozen: true,
    election: 'BR-presidencial-2026-2', electionId: '6258', deadline: FREEZE_DEADLINE,
    generatedAt, sha256: null,
    validation: { publicationReady: false, coverageValidated: false, pendingAnchors: [2, 6], note: 'Congelado para prestação de contas. Probabilidades e intervalos condicionais às hipóteses; cobertura eleitoral ainda não validada.' },
    reason: 'Cenário condicional calculado com a base oficial e premissas documentadas, congelado antes de votos do segundo turno. Não é resultado oficial nem carimbo de validação estatística.',
    methodSha256, inputs: projection.inputHashes,
    projectionDataSha256: createHash('sha256').update(bytes).digest('hex'),
    liveCheck: { source: live.source, status: live.status, electionId: live.data.electionId, round: live.data.round, generatedAt: live.data.generatedAt, fetchedAt: live.fetchedAt, sections: live.data.sections },
    projection,
  };
  snapshot.sha256 = snapshotHash(snapshot);
  verifySnapshot(snapshot);
  await writeFile(temporaryPath, JSON.stringify(snapshot) + '\n', { flag: 'wx' });
  await rename(temporaryPath, finalPath);
  console.log(JSON.stringify({ status: snapshot.status, generatedAt, sha256: snapshot.sha256, publicationReady: false, path: finalPath }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (lock) {
    await lock.close();
    await unlink(lockPath).catch(() => {});
    await unlink(temporaryPath).catch(() => {});
  }
}

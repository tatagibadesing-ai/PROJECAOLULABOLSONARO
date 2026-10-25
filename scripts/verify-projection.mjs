#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifySnapshot } from '../lib/projection-snapshot.ts';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const snapshot = verifySnapshot(JSON.parse(await readFile(path.join(root, 'projecao-final.json'), 'utf8')));
if (!snapshot.frozen) throw new Error('Não há projeção congelada.');
for (const input of snapshot.inputs) {
  const resolved = path.resolve(root, input.path);
  if (!resolved.startsWith(root + path.sep)) throw new Error('Entrada fora do projeto.');
  if (createHash('sha256').update(await readFile(resolved)).digest('hex') !== input.sha256) throw new Error('Hash da entrada mudou: ' + input.path);
}
const methodHash = createHash('sha256').update(await readFile(path.join(root, 'METODO.md'))).digest('hex');
if (methodHash !== snapshot.methodSha256) throw new Error('A versão do método diverge da versão congelada.');
console.log(JSON.stringify({ frozen: true, status: snapshot.status, generatedAt: snapshot.generatedAt, sha256: snapshot.sha256, inputHashesVerified: snapshot.inputs.length, publicationReady: snapshot.validation.publicationReady }, null, 2));

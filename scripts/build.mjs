#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifySnapshot } from '../lib/projection-snapshot.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
// The complete audit file is delivered by the static CDN, outside the 4.5 MB
// buffered function-response limit. Preserve its exact bytes and original hash.
const bytes = await readFile(new URL('../projecao-final.json', import.meta.url));
const snapshot = verifySnapshot(JSON.parse(bytes.toString('utf8')));
if (!snapshot.frozen) throw new Error('O build exige o cenário congelado existente e íntegro.');
await writeFile(new URL('../public/projecao-final.json', import.meta.url), bytes);
console.log('Arquivo congelado estático preparado, com bytes e hash preservados.');
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)), 'build'], { cwd: root, stdio: 'inherit', env: process.env });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });

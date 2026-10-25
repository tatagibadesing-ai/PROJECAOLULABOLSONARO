import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { findAvailablePort, waitForServer, commandForBrowser, assertSupportedNode } from '../scripts/start-local.mjs';

test('inicializador escolhe outra porta em vez de assumir que localhost já pertence ao app', async () => {
  const occupied = net.createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  const port = (occupied.address() as net.AddressInfo).port;
  try {
    assert.equal(await findAvailablePort(port, port + 1), port + 1);
    await assert.rejects(findAvailablePort(port, port), /ocupadas/);
  } finally { occupied.close(); }
});

test('prontidão exige resposta real do dashboard, não apenas porta aberta', async () => {
  let ready = false;
  const server = http.createServer((_, response) => response.end(ready ? '<title>Observatório</title>' : 'outro aplicativo'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as net.AddressInfo).port;
  try {
    await assert.rejects(waitForServer(`http://127.0.0.1:${port}`, { exitCode: 1 }, 20), /encerrou/);
    await assert.rejects(waitForServer(`http://127.0.0.1:${port}`, { exitCode: null }, 20), /não respondeu/);
    ready = true;
    await waitForServer(`http://127.0.0.1:${port}`, { exitCode: null }, 2000);
  } finally { server.closeAllConnections(); server.close(); }
});

test('inicializador recusa Node antigo e só abre um endereço local fixado pelo app', () => {
  assert.doesNotThrow(() => assertSupportedNode('24.19.0'));
  assert.throws(() => assertSupportedNode('22.1.0'), /Node.js 24/);
  assert.throws(() => commandForBrowser('win32', 'https://example.com'), /servidor local/);
  assert.deepEqual(commandForBrowser('win32', 'http://localhost:3001'), { command: 'explorer.exe', args: ['http://localhost:3001'] });
});

#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function assertSupportedNode(version) {
  const major = Number(String(version).replace(/^v/, '').split('.')[0]);
  if (!Number.isInteger(major) || major < 24) throw new Error('Este projeto precisa de Node.js 24 ou mais recente. Use o inicializador do seu sistema ou instale em https://nodejs.org/en/download.');
}

export function commandForBrowser(platform, url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || parsed.hostname !== 'localhost' || !/^\d+$/.test(parsed.port)) throw new Error('O navegador só pode ser aberto no servidor local deste aplicativo.');
  if (platform === 'win32') return { command: 'explorer.exe', args: [url] };
  if (platform === 'darwin') return { command: 'open', args: [url] };
  return { command: 'xdg-open', args: [url] };
}

export async function findAvailablePort(first = 3000, last = 3010) {
  for (let port = first; port <= last; port++) {
    const available = await new Promise(resolve => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error(`As portas ${first} a ${last} estão ocupadas. Feche outra cópia do dashboard e tente novamente.`);
}

async function exists(file) { try { await access(file); return true; } catch { return false; } }

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env, stdio: 'inherit', shell: process.platform === 'win32' && command.endsWith('.cmd') });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Comando de instalação terminou com código ${code}. A janela acima contém o diagnóstico.`)));
  });
}

export async function waitForServer(url, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null && child.exitCode !== undefined) throw new Error('O servidor encerrou antes de ficar pronto. Consulte a mensagem nesta janela.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok && (await response.text()).includes('Observatório')) return;
    } catch { /* startup is allowed to take time, but success requires a real response */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('O servidor não respondeu dentro de dois minutos. Consulte o diagnóstico acima.');
}

export async function main() {
  assertSupportedNode(process.version);
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
  // Keep launcher state inside this copy; never reuse the cloud's absolute paths.
  env.XDG_DATA_HOME = path.join(projectRoot, '.local-state', 'data');
  env.XDG_CACHE_HOME = path.join(projectRoot, '.local-state', 'cache');
  env.npm_config_cache = path.join(projectRoot, '.local-state', 'npm-cache');
  delete env.NODE_USE_ENV_PROXY;
  await mkdir(path.join(projectRoot, '.local-state'), { recursive: true });
  const lock = await readFile(path.join(projectRoot, 'pnpm-lock.yaml'));
  const lockHash = createHash('sha256').update(lock).digest('hex');
  const marker = path.join(projectRoot, '.local-state', 'installed-lock.sha256');
  const installed = await readFile(marker, 'utf8').catch(() => '');
  if (installed.trim() !== lockHash || !await exists(path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next'))) {
    console.log('\nPrimeira execução: instalando as dependências verificadas pelo lockfile. Aguarde alguns minutos.\n');
    await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['exec', '--yes', '--package=pnpm@11.25.0', '--', 'pnpm', 'install', '--frozen-lockfile', '--store-dir', '.local-state/pnpm-store'], env);
    await writeFile(marker, `${lockHash}\n`);
  }
  const port = await findAvailablePort();
  const url = `http://localhost:${port}`;
  console.log(`\nIniciando o dashboard NO SEU COMPUTADOR: ${url}`);
  console.log('Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.\n');
  const child = spawn(process.execPath, [path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: projectRoot, env, stdio: 'inherit' });
  let shuttingDown = false;
  const stop = () => { shuttingDown = true; child.kill('SIGTERM'); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  child.once('error', error => { console.error(error.message); process.exitCode = 1; });
  const exited = new Promise(resolve => child.once('exit', code => { if (!shuttingDown && code) process.exitCode = code; resolve(); }));
  try {
    await waitForServer(url, child);
    console.log(`\nPronto. Abra ${url} se o navegador não abrir automaticamente.\n`);
    if (!process.argv.includes('--no-browser')) {
      const browser = commandForBrowser(process.platform, url);
      const opened = spawn(browser.command, browser.args, { detached: true, stdio: 'ignore' });
      opened.on('error', () => console.log(`Abra manualmente ${url}.`));
      opened.unref();
    }
    await exited;
  } catch (error) {
    stop();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`\nNão foi possível iniciar: ${error.message}\n`); process.exitCode = 1; });
}

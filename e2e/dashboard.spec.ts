import { test, expect as baseExpect } from '@playwright/test';

// Large local data files and a cold Next dev compilation can delay hydration.
const expect = baseExpect.configure({ timeout: 15_000 });

const waiting = { status: 'waiting', source: 'TSE', fetchedAt: '2026-10-24T23:00:00Z', attemptedAt: '2026-10-24T23:00:00Z', nextPollAt: null, message: 'Fixture de teste: aguardando totalização.', data: null };

test.beforeEach(async ({ page }) => {
  await page.route('**/api/apuracao', route => route.fulfill({ json: waiting }));
});

test('base oficial, projeção condicional, mapa e busca de UF permanecem separados', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error' && /hydration|hydrated|server rendered/i.test(message.text())) errors.push(message.text()); });
  await page.goto('/');
  const baseline = page.getByRole('region', { name: 'Resultado oficial do primeiro turno' });
  await expect(baseline).toContainText('56.104.503');
  await expect(baseline).toContainText('53.879.538');
  await expect(baseline).toContainText('119.300.788');
  await expect(baseline).toContainText('5.571');
  await expect(page.locator('.integrity-banner')).toContainText('Projeção condicional');
  await expect(page.locator('.integrity-banner')).toContainText('cobertura de 80% não foi validada');
  await expect(page.locator('.candidate-value').first()).toHaveText('50,8%', { timeout: 30_000 });
  await expect(page.locator('.candidate-value').nth(1)).toHaveText('49,2%');
  await expect(page.locator('.candidate-details').first()).toContainText('60%');
  await expect(page.locator('.scenario-audit-row')).toContainText('Cenário congelado · não validado');
  await expect(page.locator('.state-table tbody tr')).toHaveCount(28);
  await expect(page.getByRole('img', { name: 'Mapa dos estados brasileiros' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar estado' }).fill('Acre');
  await expect(page.locator('.state-table tbody tr')).toHaveCount(1);
  await page.locator('.state-table tbody tr button').click();
  await expect(page.locator('.selected-detail')).toContainText('Acre');
  await expect(page.locator('.municipal-list select')).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('laboratório usa worker e controles; sair restaura a projeção condicional real', async ({ page }) => {
  await page.goto('/?ensaio=demonstracao');
  await expect(page.locator('.integrity-banner')).toContainText('sem valor eleitoral');
  await expect(page.locator('.calculation-status')).toContainText('560.000 municípios × sorteios verificados · 0 violações', { timeout: 30_000 });
  const before = await page.locator('.candidate-value').first().innerText();
  await page.locator('.sliders input').first().fill('90');
  await expect.poll(async () => page.locator('.candidate-value').first().innerText(), { timeout: 30_000 }).not.toBe(before);
  await expect(page.locator('.calculation-status')).toContainText('0 violações');
  await page.getByRole('button', { name: 'Sair do laboratório' }).click();
  await expect(page.locator('.candidate-value').first()).toHaveText('50,8%', { timeout: 30_000 });
  await expect(page.locator('.integrity-banner')).toContainText('Projeção condicional');
  await expect(page.getByRole('region', { name: 'Resultado oficial do primeiro turno' })).toBeVisible();
});

test('ensaio oficial percorre as três ordens sem se passar por apuração nem cobertura validada', async ({ page }) => {
  await page.goto('/?ensaio=1turno');
  const replay = page.getByRole('region', { name: 'Reprodução do primeiro turno' });
  await expect(replay.locator('.replay-candidates > div')).toHaveCount(12, { timeout: 20_000 });
  for (const order of ['state', 'timezone', 'totalization']) {
    await page.getByRole('combobox', { name: 'Ordem da reprodução' }).selectOption(order);
    await page.getByRole('slider', { name: 'Etapa da reprodução' }).fill('100');
    await expect(replay).toContainText('Reprodução concluída', { timeout: 20_000 });
    await expect(replay).toContainText('56.104.503');
    await expect(replay).toContainText('53.879.538');
    await expect(replay.locator('.replay-candidates > div')).toHaveCount(12);
  }
  await expect(replay).toContainText('Cobertura do intervalo de 80% ainda não validada');
});

test('boletim antigo acende o modo ao vivo e preserva o horário original', async ({ page }) => {
  const generatedAt = new Date(Date.now() - 6 * 60_000).toISOString();
  await page.unroute('**/api/apuracao');
  await page.route('**/api/apuracao', route => route.fulfill({ json: {
    ...waiting, status: 'stale', fetchedAt: new Date().toISOString(), message: 'Fixture: o TSE não publicou boletim recente.',
    data: { electionId: '6258', round: 2, generatedAt, sections: { total: 100, counted: 10, percent: 10 }, candidates: [{ id: 'flavio', name: 'Flávio Bolsonaro', votes: 520, percent: 52 }, { id: 'lula', name: 'Lula', votes: 480, percent: 48 }], blank: 10, null: 10, abstention: 100, states: [], statesComplete: false, statesReconciled: false },
  } }));
  await page.goto('/');
  await expect(page.locator('.live-status-detail')).toContainText('Desatualizado');
  await expect(page.locator('.live-status-detail')).toContainText('há 6min');
  await expect(page.locator('.candidate-value').first()).toHaveText('52,0%');
  await expect(page.locator('.live-explanation')).toContainText('aguarda boletins válidos e recentes');
  await expect(page.locator('.history-notice')).toContainText('boletins oficiais efetivamente recebidos');
  await page.getByRole('navigation').getByRole('button', { name: 'Projeção × Resultado' }).click();
  await expect(page.locator('.comparison-notice')).toContainText('Cenário condicional congelado');
  await expect(page.locator('.comparison-panel')).toContainText('Resultados parciais não são tratados como erro final');
});

test('mapa municipal usa canvas e exterior com zero válidos nunca mostra NaN', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.candidate-value').first()).toHaveText('50,8%', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Explorar mapa municipal', exact: true }).click();
  const canvas = page.getByRole('img', { name: /^Mapa de municípios de SP/ });
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.getAttribute('data-feature-count')).toBe('645');
  await expect(page.getByRole('combobox', { name: 'Selecionar município no mapa' })).toBeVisible();
  await page.getByRole('button', { name: 'Exterior', exact: true }).click();
  await page.getByRole('combobox', { name: 'Selecionar município', exact: true }).selectOption('ZZ-29424');
  await expect(page.locator('.city-comparison')).toContainText('22 eleitores · 0 válidos');
  await expect(page.locator('.city-comparison > div').first()).toContainText('Flávio—');
  await expect(page.locator('.city-comparison > div').first()).toContainText('Lula—');
  await expect(page.locator('main')).not.toContainText('NaN');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('hipótese condicional recalcula 20.000 simulações sem alterar o arquivo congelado', async ({ page, request }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const frozenBefore = await (await request.get('/api/projecao?metadata=1')).json();
  expect(frozenBefore.frozen).toBe(true);
  expect(frozenBefore.sha256).toMatch(/^[a-f0-9]{64}$/);
  await page.goto('/');
  await expect(page.locator('.candidate-value').first()).toHaveText('50,8%', { timeout: 30_000 });
  await page.locator('.sliders input').first().fill('85');
  await expect(page.locator('.integrity-banner')).toContainText('Rascunho condicional');
  await expect.poll(async () => page.locator('.candidate-value').first().innerText(), { timeout: 15_000 }).not.toBe('50,8%');
  await expect(page.locator('.candidate-details').first()).toContainText('em cálculo');
  expect(errors).toEqual([]);
  await expect(page.locator('.calculation-status')).toContainText('115.140.000 municípios × sorteios verificados · 0 violações', { timeout: 105_000 });
  await expect(page.locator('.candidate-details').first()).not.toContainText('em cálculo');
  const frozenAfter = await (await request.get('/api/projecao?metadata=1')).json();
  expect(frozenAfter.sha256).toBe(frozenBefore.sha256);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Restaurar cenário' }).click();
  await expect(page.locator('.candidate-value').first()).toHaveText('50,8%', { timeout: 30_000 });
});

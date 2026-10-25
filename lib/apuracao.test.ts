import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  OFFICIAL_2026_CONFIG, TSE_PUBLIC_JWK, MIN_POLL_MS, assertNoRegression,
  configFromEnvironment, createApuracaoService, normalizeOfficialBulletin,
  validateFeedConfig, verifyOfficialJws,
} from "./apuracao";
import type { PersistedOfficialSnapshot } from "./apuracao";

// All bulletin numbers below are synthetic test data. This is not an official replay.
const keys = generateKeyPairSync("ed25519");
const fixtureKey = { ...keys.publicKey.export({ format: "jwk" }), alg: "EdDSA", kid: "synthetic-test-key" } as typeof TSE_PUBLIC_JWK;
const now = Date.parse("2026-10-25T21:00:00Z");
function fixture(overrides: Record<string, unknown> = {}) {
  return {
    ele: "6258", t: "2", f: "o", tpabr: "br", cdabr: "br", dg: "25/10/2026", hg: "18:00:00", tf: "n",
    carg: [{ cd: "1", agr: [{ par: [{ cand: [
      { n: "13", nmu: "Lula", vap: "45" }, { n: "22", nmu: "Flávio Bolsonaro", vap: "55" },
    ] }] }] }],
    s: { ts: "100", st: "10" },
    e: { te: "1000", c: "110", a: "20", esni: "0" },
    v: { vvc: "100", vb: "5", tvn: "5", tv: "110" },
    ...overrides,
  };
}
function signed(data: unknown) {
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", kid: fixtureKey.kid })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign(null, Buffer.from(input), keys.privateKey).toString("base64url")}`;
}
const response = (data = fixture()) => new Response(signed(data));

test("official URL validation blocks nonofficial hosts, redirects, credentials and ambiguous identities", () => {
  assert.equal(validateFeedConfig(OFFICIAL_2026_CONFIG).electionId, "6258");
  for (const url of [
    "https://example.com/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws",
    OFFICIAL_2026_CONFIG.url.replace("https:", "http:"),
    OFFICIAL_2026_CONFIG.url.replace("resultados.tse.jus.br", "resultados.tse.jus.br.evil.test"),
    OFFICIAL_2026_CONFIG.url.replace("https://", "https://user:pass@"),
    `${OFFICIAL_2026_CONFIG.url}?redirect=foo`,
    OFFICIAL_2026_CONFIG.url.replace(".jws", ".json"),
  ]) assert.throws(() => validateFeedConfig({ ...OFFICIAL_2026_CONFIG, url }));
  assert.throws(() => validateFeedConfig({ ...OFFICIAL_2026_CONFIG, electionId: "6257" }));
  assert.throws(() => validateFeedConfig({ ...OFFICIAL_2026_CONFIG, lulaId: "22" }));
  assert.deepEqual(configFromEnvironment({}), OFFICIAL_2026_CONFIG);
  assert.equal(configFromEnvironment({ TSE_RESULTS_URL: OFFICIAL_2026_CONFIG.url }), null);
});

test("cryptographic verification rejects altered payload, unsigned JSON and unknown key", () => {
  const token = signed(fixture());
  assert.deepEqual(verifyOfficialJws(token, fixtureKey), fixture());
  assert.throws(() => verifyOfficialJws(JSON.stringify(fixture()), fixtureKey));
  const parts = token.split(".");
  parts[1] = Buffer.from(JSON.stringify(fixture({ ele: "999" }))).toString("base64url");
  assert.throws(() => verifyOfficialJws(parts.join("."), fixtureKey), /Assinatura do TSE inválida/);
  assert.throws(() => verifyOfficialJws(token), /chave de assinatura/);
});

test("normalizer keeps first-round ordering and recomputes percentages from integer votes", () => {
  const data = normalizeOfficialBulletin(fixture(), OFFICIAL_2026_CONFIG);
  assert.deepEqual(data.candidates.map(({ id, votes }) => ({ id, votes })), [
    { id: "flavio", votes: 55 }, { id: "lula", votes: 45 },
  ]);
  assert.ok(Math.abs(data.candidates[0].percent - 55) < 1e-10);
  assert.equal(data.generatedAt, "2026-10-25T21:00:00.000Z");
  assert.equal(data.sections.percent, 10);
  assert.equal(data.blank + data.null + data.candidates[0].votes + data.candidates[1].votes, data.turnout);
});

test("normalizer rejects wrong election, round, cargo, incomplete counts and impossible totals", () => {
  for (const values of [
    { ele: "6257" }, { t: "1" }, { f: "s" }, { tpabr: "uf" }, { cdabr: "sp" },
    { s: { ts: "100", st: "101" } }, { s: { ts: "100", st: "0" } },
    { e: { te: "100", c: "110", a: "20", esni: "0" } },
    { v: { vvc: "99", vb: "5", tvn: "5", tv: "109" } },
    { v: { vvc: "100", vb: "-1", tvn: "5", tv: "104" } },
    { v: { vvc: "100", vb: "5.5", tvn: "5", tv: "110" } },
    { v: { vvc: "100", tvn: "5", tv: "110" } },
    { dg: "31/02/2026" }, { hg: "24:00:00" }, { tf: "s" },
    { tf: "s", s: { ts: "100", st: "100" } },
    { carg: [] },
  ]) assert.throws(() => normalizeOfficialBulletin(fixture(values), OFFICIAL_2026_CONFIG), JSON.stringify(values));
});

test("noninstalled electorate is preserved separately instead of inventing absentee voters", () => {
  const data = normalizeOfficialBulletin(fixture({ e: { te: "1000", c: "110", a: "20", esni: "3" } }), OFFICIAL_2026_CONFIG);
  assert.equal(data.notInstalledElectorate, 3);
  assert.equal(data.abstention, 20);
});

test("singleflight and cache allow at most one external fetch per 30 seconds", async () => {
  let clock = now, calls = 0;
  const service = createApuracaoService({ config: OFFICIAL_2026_CONFIG, now: () => clock, publicKey: fixtureKey, fetch: async (_url, options) => {
    calls++; assert.equal(options?.redirect, "error");
    await new Promise((resolve) => setTimeout(resolve, 5));
    return response();
  } });
  const results = await Promise.all(Array.from({ length: 20 }, () => service.get()));
  assert.equal(calls, 1); assert.ok(results.every((result) => result.status === "live"));
  clock += MIN_POLL_MS - 1;
  await service.get(); assert.equal(calls, 1);
  clock++; await service.get(); assert.equal(calls, 2);
});

test("failed fetch is cached and retains original source and receipt timestamps", async () => {
  let clock = now, calls = 0;
  const service = createApuracaoService({ config: OFFICIAL_2026_CONFIG, now: () => clock, publicKey: fixtureKey, fetch: async () => {
    calls++; return calls === 1 ? response() : new Response("unavailable", { status: 503 });
  } });
  const first = await service.get();
  clock += MIN_POLL_MS;
  const stale = await service.get();
  assert.equal(stale.status, "stale"); assert.equal(stale.fetchedAt, first.fetchedAt);
  assert.deepEqual(stale.data, first.data); assert.match(stale.message, /HTTP 503/);
  await service.get(); assert.equal(calls, 2);
});

test("initial failure does not create zero votes or report a successful update", async () => {
  let calls = 0;
  const service = createApuracaoService({ config: OFFICIAL_2026_CONFIG, now: () => now, fetch: async () => { calls++; throw new Error("offline"); } });
  const failed = await service.get();
  assert.equal(failed.status, "error"); assert.equal(failed.data, null); assert.equal(failed.fetchedAt, null);
  await service.get(); assert.equal(calls, 1);
});

test("signature failures and regressions preserve last verified bulletin", async () => {
  let clock = now, calls = 0;
  const service = createApuracaoService({ config: OFFICIAL_2026_CONFIG, now: () => clock, publicKey: fixtureKey, fetch: async () => {
    calls++; return calls === 1 ? response() : calls === 2 ? response(fixture({ s: { ts: "100", st: "9" } })) : new Response("unsigned");
  } });
  const good = await service.get();
  clock += MIN_POLL_MS;
  const regression = await service.get(); assert.equal(regression.status, "stale"); assert.match(regression.message, /regressivo/);
  clock += MIN_POLL_MS;
  const unsigned = await service.get(); assert.equal(unsigned.status, "stale"); assert.deepEqual(unsigned.data, good.data);
});

test("delayed nonfinal source is stale while a completed official tally stays final", async () => {
  const service = createApuracaoService({ config: OFFICIAL_2026_CONFIG, now: () => now + 180_000, publicKey: fixtureKey, fetch: async () => response() });
  assert.equal((await service.get()).status, "stale");
  const finalInput = fixture({ tf: "s", s: { ts: "100", st: "100" }, e: { te: "130", c: "110", a: "20", esni: "0" } });
  const final = createApuracaoService({ config: OFFICIAL_2026_CONFIG, now: () => now + 180_000, publicKey: fixtureKey, fetch: async () => response(finalInput) });
  assert.equal((await final.get()).status, "live");
  const prev = normalizeOfficialBulletin(finalInput, OFFICIAL_2026_CONFIG);
  assert.throws(() => assertNoRegression(prev, normalizeOfficialBulletin(fixture(), OFFICIAL_2026_CONFIG)));
});

test("zero counted sections is a verified waiting bulletin, not a live result", async () => {
  const empty = fixture({
    s: { ts: "100", st: "0" }, e: { te: "1000", c: "0", a: "0", esni: "0" }, v: { tv: "0", vvc: "0", vb: "0", tvn: "0" },
    carg: [{ cd: "1", agr: [{ par: [{ cand: [{ n: "22", nmu: "Flávio Bolsonaro", vap: "0" }, { n: "13", nmu: "Lula", vap: "0" }] }] }] }],
  });
  const service = createApuracaoService({ config: OFFICIAL_2026_CONFIG, now: () => now, publicKey: fixtureKey, fetch: async () => response(empty) });
  const waiting = await service.get(); assert.equal(waiting.status, "waiting"); assert.equal(waiting.data?.sections.counted, 0);
  const disabled = createApuracaoService({ config: null, fetch: async () => { throw new Error("must not fetch"); } });
  assert.equal((await disabled.get()).status, "unconfigured");
});

test("timeout preserves honest error status and rate-limits subsequent retries", async () => {
  let calls = 0;
  const service = createApuracaoService({ config: OFFICIAL_2026_CONFIG, timeoutMs: 5, now: () => now, fetch: async (_url, options) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  } });
  const result = await service.get(); assert.equal(result.status, "error"); assert.match(result.message, /Tempo limite/);
  await service.get(); assert.equal(calls, 1);
});

test("state collection limits concurrency, normalizes signed scopes and preserves failed states", async () => {
  let clock = now, round = 0, active = 0, maximum = 0, calls = 0;
  const service = createApuracaoService({ config: OFFICIAL_2026_CONFIG, collectStates: true, now: () => clock, publicKey: fixtureKey, fetch: async (url) => {
    calls++;
    const scope = /\/dados\/([a-z]+)\//.exec(String(url))![1];
    if (scope === "br") return response();
    active++; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    if (round === 1 && scope === "sp") return new Response("unavailable", { status: 503 });
    return response(fixture({ tpabr: "uf", cdabr: scope }));
  } });
  const first = await service.get();
  assert.equal(first.data?.states.length, 28); assert.equal(first.data?.statesComplete, true);
  assert.equal(first.data?.statesReconciled, false); // intentionally unbalanced synthetic fixture
  assert.equal(maximum, 4); assert.equal(calls, 29);
  await service.get(); assert.equal(calls, 29);
  const sp = first.data!.states.find((state) => state.uf === "SP")!;
  round++; clock += MIN_POLL_MS;
  const next = await service.get();
  assert.equal(next.status, "stale"); assert.deepEqual(next.stateIssues, ["SP"]);
  assert.equal(next.data?.statesComplete, false); assert.equal(next.data?.states.length, 28);
  assert.equal(next.data?.states.find((state) => state.uf === "SP")?.fetchedAt, sp.fetchedAt);
});

test("a bulletin for the wrong UF and candidate name mismatch are rejected", () => {
  assert.throws(() => normalizeOfficialBulletin(fixture({ tpabr: "uf", cdabr: "sp" }), OFFICIAL_2026_CONFIG, "rj"));
  const wrong = fixture();
  wrong.carg[0].agr[0].par[0].cand[0].nmu = "Outro candidato";
  assert.throws(() => normalizeOfficialBulletin(wrong, OFFICIAL_2026_CONFIG), /Nome e identificador/);
});

test("restart restores only verified signed cache, preserving timestamps and rate limit", async () => {
  let saved: PersistedOfficialSnapshot | null = null, calls = 0, clock = now;
  const persistence = { async load() { return saved; }, async save(snapshot: PersistedOfficialSnapshot) { saved = structuredClone(snapshot); } };
  const first = createApuracaoService({ config: OFFICIAL_2026_CONFIG, persistence, publicKey: fixtureKey, now: () => clock, fetch: async () => { calls++; return response(); } });
  const original = await first.get();
  assert.ok(saved); assert.equal(calls, 1);
  clock += 1000;
  const restarted = createApuracaoService({ config: OFFICIAL_2026_CONFIG, persistence, publicKey: fixtureKey, now: () => clock, fetch: async () => { calls++; throw new Error("offline"); } });
  const recovered = await restarted.get();
  assert.equal(calls, 1); assert.equal(recovered.status, "stale");
  assert.deepEqual(recovered.data, original.data); assert.equal(recovered.fetchedAt, original.fetchedAt);
  assert.equal(recovered.persistence?.restored, true);
  clock += MIN_POLL_MS;
  const failed = await restarted.get();
  assert.equal(calls, 2); assert.equal(failed.status, "stale"); assert.deepEqual(failed.data, original.data);
});

test("tampered cache cannot manufacture an official bulletin, and disk failures do not suppress live data", async () => {
  const persistence = {
    async load() { return { schemaVersion: 1, electionId: "6258", fetchedAt: new Date(now).toISOString(), attemptedAt: new Date(now).toISOString(), nextPollAt: new Date(now + MIN_POLL_MS).toISOString(), nationalJws: "unsigned", states: [], stateIssues: [] } as PersistedOfficialSnapshot; },
    async save() { throw new Error("read-only disk"); },
  };
  const service = createApuracaoService({ config: OFFICIAL_2026_CONFIG, persistence, publicKey: fixtureKey, now: () => now, fetch: async () => response() });
  const good = await service.get();
  assert.equal(good.status, "live"); assert.equal(good.persistence?.restored, false);
  assert.match(good.persistence!.error!, /salvar/);
  assert.equal(good.data?.candidates[0].votes, 55);
});

test("selected municipality uses the discovered official path, checks its code and keeps its own cache", async () => {
  let calls = 0;
  const service = createApuracaoService({ config: OFFICIAL_2026_CONFIG, municipality: { uf: "SP", code: "71072" }, publicKey: fixtureKey, now: () => now, fetch: async (url) => {
    calls++; assert.equal(url, "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/sp/sp71072-c0001-e006258-u.jws");
    return response(fixture({ tpabr: "mu", cdabr: "71072" }));
  } });
  const selected = await service.get();
  assert.equal(selected.status, "live"); assert.deepEqual(selected.data?.scope, { type: "municipal", uf: "SP", municipality: "71072" });
  assert.deepEqual(selected.data?.states, []);
  await service.get(); assert.equal(calls, 1);
  assert.throws(() => normalizeOfficialBulletin(fixture({ tpabr: "mu", cdabr: "71072" }), OFFICIAL_2026_CONFIG, "sp", "71073"));
  assert.throws(() => createApuracaoService({ config: OFFICIAL_2026_CONFIG, municipality: { uf: "SP", code: "71072" }, collectStates: true }));
});

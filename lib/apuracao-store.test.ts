import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFileFeedPersistence, resolveFeedStorage } from "./apuracao-store";
import { OFFICIAL_2026_CONFIG, type PersistedOfficialSnapshot, type VerificationJwk } from "./apuracao";

// Synthetic, cryptographically signed fixtures; this suite does not replay official results.
const keys = generateKeyPairSync("ed25519");
const publicKey = { ...keys.publicKey.export({ format: "jwk" }), alg: "EdDSA", kid: "synthetic-archive-key" } as VerificationJwk;
function token(votes = 55, time = "18:00:00") {
  const data = { ele: "6258", t: "2", f: "o", tpabr: "br", cdabr: "br", dg: "25/10/2026", hg: time, tf: "n", carg: [{ cd: "1", agr: [{ par: [{ cand: [{ n: "22", nmu: "Flávio Bolsonaro", vap: String(votes) }, { n: "13", nmu: "Lula", vap: "45" }] }] }] }], s: { ts: "100", st: "10" }, e: { te: "1000", c: String(votes + 55), a: "20", esni: "0" }, v: { vvc: String(votes + 45), vb: "5", tvn: "5", tv: String(votes + 55) } };
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", kid: publicKey.kid })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign(null, Buffer.from(input), keys.privateKey).toString("base64url")}`;
}
const snapshot = (jws = token()): PersistedOfficialSnapshot => ({ schemaVersion: 1, electionId: "6258", fetchedAt: "2026-10-25T21:00:00.000Z", attemptedAt: "2026-10-25T21:00:00.000Z", nextPollAt: "2026-10-25T21:00:30.000Z", nationalJws: jws, states: [], stateIssues: [] });

test("Vercel cache is forced into writable temporary storage and accurately marked instance-local", () => {
  const location = resolveFeedStorage({ VERCEL: "1", TSE_CACHE_DIR: "/readonly-project/custom" }, "/readonly-project", "/tmp");
  assert.equal(location.directory, path.join("/tmp", "projecao-apuracao-2026"));
  assert.equal(location.mode, "ephemeral"); assert.equal(location.shared, false);
  assert.match(location.message, /temporário/); assert.match(location.message, /reinícios/);
  const local = resolveFeedStorage({}, "/pc-project", "/tmp");
  assert.equal(local.directory, path.resolve("/pc-project", "dados", "local"));
  assert.equal(local.mode, "persistent"); assert.equal(local.shared, false);
  assert.equal(resolveFeedStorage({ TSE_CACHE_DIR: "runtime-data" }, "/pc-project", "/tmp").directory, path.resolve("/pc-project", "runtime-data"));
});

test("atomic PC cache roundtrips and repeated identical bulletins do not duplicate history", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tse-pc-cache-"));
  try {
    const store = createFileFeedPersistence(directory, OFFICIAL_2026_CONFIG, publicKey);
    assert.equal(await store.load(), null);
    await store.save(snapshot()); await store.save(snapshot());
    assert.deepEqual(await store.load(), snapshot());
    const history = await store.history();
    assert.equal(history.points.length, 1); assert.equal(history.rejectedEntries, 0);
    assert.equal(history.points[0].flavioVotes, 55); assert.equal(history.points[0].lulaVotes, 45);
    assert.equal(history.points[0].generatedAt, "2026-10-25T21:00:00.000Z");
    assert.equal(history.points[0].receivedAt, snapshot().fetchedAt);
    assert.match(history.points[0].id, /^[a-f0-9]{64}$/);
  } finally { await rm(directory, { recursive: true }); }
});

test("new received bulletin adds an actual point and concurrent writes stay valid JSON", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tse-pc-cache-"));
  try {
    const store = createFileFeedPersistence(directory, OFFICIAL_2026_CONFIG, publicKey);
    await Promise.all([store.save(snapshot()), store.save(snapshot(token(56, "18:00:30")))]);
    const history = await store.history();
    assert.equal(history.points.length, 2);
    assert.deepEqual(history.points.map((point) => point.flavioVotes), [55, 56]);
    assert.equal((await store.load())?.nationalJws, token(56, "18:00:30"));
    JSON.parse(await readFile(path.join(directory, "latest-6258.json"), "utf8"));
  } finally { await rm(directory, { recursive: true }); }
});

test("history rechecks signatures and rejects a forged disk entry", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tse-pc-cache-"));
  try {
    const store = createFileFeedPersistence(directory, OFFICIAL_2026_CONFIG, publicKey);
    await store.save(snapshot());
    const filename = path.join(directory, "history-6258.json");
    const data = JSON.parse(await readFile(filename, "utf8"));
    data.entries.push({ receivedAt: snapshot().fetchedAt, jws: "unsigned.fake.entry" });
    await writeFile(filename, JSON.stringify(data));
    const history = await store.history();
    assert.equal(history.points.length, 1); assert.equal(history.rejectedEntries, 1);
    await writeFile(filename, "{broken-json");
    await assert.rejects(store.history());
  } finally { await rm(directory, { recursive: true }); }
});

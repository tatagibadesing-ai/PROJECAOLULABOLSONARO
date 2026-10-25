import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  configFromEnvironment, createApuracaoService, normalizeOfficialBulletin,
  verifyOfficialJws, type FeedConfig, type FeedPersistence,
  type PersistedOfficialSnapshot, type VerificationJwk,
} from "./apuracao";

type StoredHistory = { schemaVersion: 1; electionId: string; entries: Array<{ receivedAt: string; jws: string }> };
const HISTORY_LIMIT = 2_000; // More than sixteen hours at one new bulletin every 30 seconds.
const MAX_STORE_BYTES = 20_000_000;
export interface HistoryPoint {
  id: string; source: "TSE"; electionId: string; generatedAt: string; receivedAt: string;
  sectionsCounted: number; sectionsTotal: number;
  flavioVotes: number; lulaVotes: number; flavioShare: number | null;
  blank: number; null: number; abstention: number; final: boolean;
}
async function readJson(filename: string): Promise<unknown | null> {
  try {
    if ((await stat(filename)).size > MAX_STORE_BYTES) throw new Error("Cache excedeu o limite de leitura.");
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw cause;
  }
}
async function atomicWrite(filename: string, value: unknown) {
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, filename);
}

/** PC single-instance durable storage. Only signed public election data is retained.
 * It is not a shared cache for multiple Vercel instances, and serverless disks are ephemeral.
 */
export function createFileFeedPersistence(directory: string, config: FeedConfig, publicKey?: Readonly<VerificationJwk>): FeedPersistence & {
  history(): Promise<{ points: HistoryPoint[]; rejectedEntries: number; limit: number }>;
} {
  const latestPath = path.join(directory, `latest-${config.electionId}.json`);
  const historyPath = path.join(directory, `history-${config.electionId}.json`);
  let writing = Promise.resolve();
  async function loadHistory(): Promise<StoredHistory> {
    const existing = await readJson(historyPath);
    if (!existing) return { schemaVersion: 1, electionId: config.electionId, entries: [] };
    const stored = existing as StoredHistory;
    if (stored.schemaVersion !== 1 || stored.electionId !== config.electionId || !Array.isArray(stored.entries) || stored.entries.length > HISTORY_LIMIT) throw new Error("Arquivo de histórico incompatível.");
    return stored;
  }
  return {
    async load() { return await readJson(latestPath) as PersistedOfficialSnapshot | null; },
    save(snapshot) {
      writing = writing.catch(() => undefined).then(async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await atomicWrite(latestPath, snapshot);
        const history = await loadHistory();
        const token = snapshot.nationalJws.trim();
        if (history.entries.at(-1)?.jws !== token) {
          // Reverify before archiving, including for callers other than the collector.
          normalizeOfficialBulletin(verifyOfficialJws(token, publicKey), config);
          history.entries.push({ receivedAt: snapshot.fetchedAt, jws: token });
          history.entries = history.entries.slice(-HISTORY_LIMIT);
          await atomicWrite(historyPath, history);
        }
      });
      return writing;
    },
    async history() {
      await writing.catch(() => undefined);
      const stored = await loadHistory();
      const points: HistoryPoint[] = [], seen = new Set<string>();
      let rejectedEntries = 0;
      for (const entry of stored.entries) {
        try {
          if (!Number.isFinite(Date.parse(entry.receivedAt))) throw new Error("Horário inválido.");
          const data = normalizeOfficialBulletin(verifyOfficialJws(entry.jws, publicKey), config);
          const id = createHash("sha256").update(entry.jws.trim()).digest("hex");
          if (seen.has(id)) continue;
          seen.add(id);
          const valid = data.candidates[0].votes + data.candidates[1].votes;
          points.push({
            id, source: "TSE", electionId: data.electionId,
            generatedAt: data.generatedAt, receivedAt: entry.receivedAt,
            sectionsCounted: data.sections.counted, sectionsTotal: data.sections.total,
            flavioVotes: data.candidates[0].votes, lulaVotes: data.candidates[1].votes,
            flavioShare: valid === 0 ? null : data.candidates[0].votes / valid,
            blank: data.blank, null: data.null, abstention: data.abstention, final: data.final,
          });
        } catch { rejectedEntries++; }
      }
      return { points, rejectedEntries, limit: HISTORY_LIMIT };
    },
  };
}

export interface FeedStorageLocation {
  directory: string;
  mode: "persistent" | "ephemeral";
  shared: false;
  message: string;
}
/** Vercel project files are read-only. Its /tmp directory is writable, instance-local,
 * and ephemeral; neither retention nor a global 30-second request limit is guaranteed.
 * Even an explicit TSE_CACHE_DIR cannot redirect a Vercel function into its read-only bundle.
 */
export function resolveFeedStorage(
  env: Readonly<Record<string, string | undefined>>,
  workingDirectory: string,
  temporaryDirectory = tmpdir(),
): FeedStorageLocation {
  if (env.VERCEL === "1") return {
    directory: path.join(temporaryDirectory, "projecao-apuracao-2026"),
    mode: "ephemeral", shared: false,
    message: "Histórico temporário nesta instância da hospedagem; pode desaparecer em reinícios ou diferir entre acessos. Não há cache compartilhado entre instâncias.",
  };
  return {
    directory: path.resolve(workingDirectory, env.TSE_CACHE_DIR || path.join("dados", "local")),
    mode: "persistent", shared: false,
    message: "Histórico salvo nesta instalação; não é compartilhado com outras instâncias.",
  };
}

function runtimeStore() {
  const config = configFromEnvironment(process.env);
  const storage = resolveFeedStorage(process.env, process.cwd());
  // Writable runtime cache: do not trace it as a deployment asset.
  return { config, storage, persistence: config ? createFileFeedPersistence(path.resolve(/* turbopackIgnore: true */ storage.directory), config) : undefined };
}
type RuntimeCollector = { service: ReturnType<typeof createApuracaoService>; store: ReturnType<typeof createFileFeedPersistence> | undefined; storage: FeedStorageLocation };
const globals = globalThis as typeof globalThis & { __official2026Collector?: RuntimeCollector };
export function getRuntimeCollector(): RuntimeCollector {
  if (!globals.__official2026Collector) {
    const { config, storage, persistence } = runtimeStore();
    globals.__official2026Collector = { service: createApuracaoService({ config, collectStates: true, persistence, persistenceMode: storage.mode }), store: persistence, storage };
  }
  return globals.__official2026Collector;
}

let municipalMembership: Promise<Map<string, string>> | undefined;
const municipalServices = new Map<string, ReturnType<typeof createApuracaoService>>();
/** Only the selected municipality is fetched. Membership comes from the installed,
 * reconciled official first-round base; a municipality is never inferred from an IBGE id.
 */
export async function getMunicipalCollector(uf: string, municipality: string) {
  const key = `${uf.toUpperCase()}-${municipality}`;
  municipalMembership ??= readFile(path.join(process.cwd(), "public", "data", "first-round-2026.json"), "utf8").then((text) => {
    const source = JSON.parse(text) as { cities: Array<{ id: string; uf: string; name: string }> };
    return new Map(source.cities.map((city) => [city.id, city.name]));
  });
  const name = (await municipalMembership).get(key);
  if (!name) return null;
  if (!municipalServices.has(key)) municipalServices.set(key, createApuracaoService({ config: configFromEnvironment(process.env), municipality: { uf, code: municipality } }));
  return { service: municipalServices.get(key)!, id: key, name, uf: uf.toUpperCase(), code: municipality };
}

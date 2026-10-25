import { createPublicKey, verify } from "node:crypto";
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici";

/** Discovered in the official application and verified against its signed config on 24/10/2026.
 * Source: https://resultados.tse.jus.br/oficial/app/main.f31aece23cbbdd2d.js, module 7695.
 * This is a PUBLIC verification key, not a credential. Rotation must be independently verified.
 */
export type VerificationJwk = { kty: "OKP"; alg: "EdDSA"; kid: string; crv: "Ed25519"; x: string };
export const TSE_PUBLIC_JWK: Readonly<VerificationJwk> = Object.freeze({
  kty: "OKP", alg: "EdDSA", kid: "sNbt9Q_fLS65zE1_ZLNV-XRRwPY",
  crv: "Ed25519", x: "kWlpNHjuws1csyQZwzn3Fhzbi3RD435RbpThtSr4hMc",
});
export const OFFICIAL_2026_CONFIG = Object.freeze({
  url: "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws",
  electionId: "6258", flavioId: "22", lulaId: "13",
});
export const MIN_POLL_MS = 30_000;
export const OFFICIAL_UFS = ["ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt", "pa", "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to", "zz"] as const;
const SOURCE_MAX_AGE_MS = 120_000;
const MAX_BODY_BYTES = 2_000_000;

export type NormalizedCandidate = { id: "flavio" | "lula"; name: string; votes: number; percent: number };
export type BulletinCounts = {
  generatedAt: string;
  sections: { total: number; counted: number; percent: number };
  candidates: [NormalizedCandidate, NormalizedCandidate];
  blank: number; null: number; abstention: number;
  electorate: number; turnout: number; notInstalledElectorate: number;
  final: boolean;
};
export type NormalizedState = BulletinCounts & { uf: string; fetchedAt: string };
export type NormalizedBulletin = BulletinCounts & {
  electionId: string; round: 2; states: NormalizedState[];
  statesComplete: boolean; statesReconciled: boolean;
  scope?: { type: "municipal"; uf: string; municipality: string };
};
export type ApuracaoResponse = {
  status: "unconfigured" | "waiting" | "live" | "stale" | "error";
  source: "TSE"; fetchedAt: string | null; attemptedAt: string | null;
  nextPollAt: string | null; message: string; data: NormalizedBulletin | null;
  stateIssues?: string[];
  persistence?: { enabled: boolean; restored: boolean; error: string | null; mode?: "persistent" | "ephemeral" | "disabled"; shared?: false; message?: string };
};
export type PersistedOfficialSnapshot = {
  schemaVersion: 1;
  electionId: string;
  fetchedAt: string;
  attemptedAt: string;
  nextPollAt: string;
  nationalJws: string;
  states: Array<{ uf: string; fetchedAt: string; jws: string }>;
  stateIssues: string[];
};
export interface FeedPersistence {
  load(): Promise<PersistedOfficialSnapshot | null>;
  save(snapshot: PersistedOfficialSnapshot): Promise<void>;
}
export type FeedConfig = { url: string; electionId: string; flavioId: string; lulaId: string };
type JsonRecord = Record<string, unknown>;
type FeedResponse = {
  ok: boolean; status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};
type FeedRequestInit = {
  signal: AbortSignal; redirect: "error"; cache: "no-store";
  headers: Record<string, string>;
};
export type FeedFetcher = (url: string, init: FeedRequestInit) => Promise<FeedResponse>;
let officialProxyAgent: EnvHttpProxyAgent | undefined;

/** The environment proxy applies exclusively to these external TSE requests.
 * A global Node proxy would also change Next's internal HTTP/WebSocket traffic.
 * Undici uses Node's TLS trust, including NODE_EXTRA_CA_CERTS; verification stays enabled.
 */
const fetchOfficial: FeedFetcher = (url, init) => {
  const hasProxy = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
  if (!hasProxy) return fetch(url, init);
  officialProxyAgent ??= new EnvHttpProxyAgent();
  return undiciFetch(url, { ...init, dispatcher: officialProxyAgent });
};

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Estrutura inválida: ${label}.`);
  return value as JsonRecord;
}
function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Lista inválida: ${label}.`);
  return value;
}
function count(value: unknown, label: string): number {
  if (!(typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)))) {
    throw new Error(`Contagem inválida: ${label}.`);
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Contagem inválida: ${label}.`);
  return n;
}
function sourceDate(day: unknown, time: unknown): string {
  if (typeof day !== "string" || typeof time !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(day) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) {
    throw new Error("Data de geração do boletim inválida.");
  }
  const [d, m, y] = day.split("/").map(Number);
  const [h, min, sec] = time.split(":").map(Number);
  const epoch = Date.UTC(y, m - 1, d, h + 3, min, sec);
  const local = new Date(epoch - 3 * 3_600_000);
  if (local.getUTCFullYear() !== y || local.getUTCMonth() !== m - 1 || local.getUTCDate() !== d || h > 23 || min > 59 || sec > 59) {
    throw new Error("Data de geração do boletim inválida.");
  }
  return new Date(epoch).toISOString();
}

export function validateFeedConfig(config: FeedConfig): FeedConfig {
  const url = new URL(config.url);
  if (url.protocol !== "https:" || url.hostname !== "resultados.tse.jus.br" || url.port || url.username || url.password || url.hash || url.search) {
    throw new Error("A divulgação exige HTTPS no domínio oficial do TSE, sem credenciais ou redirecionamento.");
  }
  if (!/^\/oficial\/ele2026\/\d+\/dados\/br\/br-c0001-e\d{6}-u\.jws$/.test(url.pathname)) {
    throw new Error("A URL deve apontar ao boletim nacional presidencial assinado de 2026.");
  }
  for (const id of [config.electionId, config.flavioId, config.lulaId]) {
    if (!/^\d+$/.test(id)) throw new Error("Identificador da eleição ou candidato inválido.");
  }
  if (config.flavioId === config.lulaId) throw new Error("Os candidatos precisam de identificadores distintos.");
  if (!url.pathname.includes(`/${config.electionId}/`) || !url.pathname.endsWith(`-e${config.electionId.padStart(6, "0")}-u.jws`)) {
    throw new Error("URL e código da eleição divergem.");
  }
  return { ...config, url: url.toString() };
}

/** Every override must be explicit; no fallback mixes election and candidate identities. */
export function configFromEnvironment(env: Record<string, string | undefined>): FeedConfig | null {
  const keys = ["TSE_RESULTS_URL", "TSE_ELECTION_ID", "TSE_FLAVIO_ID", "TSE_LULA_ID"] as const;
  if (!keys.some((key) => env[key] !== undefined)) return { ...OFFICIAL_2026_CONFIG };
  if (keys.some((key) => !env[key]?.trim())) return null;
  return validateFeedConfig({ url: env.TSE_RESULTS_URL!, electionId: env.TSE_ELECTION_ID!, flavioId: env.TSE_FLAVIO_ID!, lulaId: env.TSE_LULA_ID! });
}

/** Compact JWS, Ed25519. Unauthenticated JSON and unknown keys are never accepted. */
export function verifyOfficialJws(token: string, jwk = TSE_PUBLIC_JWK): unknown {
  if (Buffer.byteLength(token) > MAX_BODY_BYTES) throw new Error("Boletim excedeu o limite de tamanho.");
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error("Assinatura JWS ausente ou malformada.");
  const [headerPart, payload, signature] = parts;
  const header = record(JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")), "cabeçalho JWS");
  if (header.alg !== "EdDSA" || header.kid !== jwk.kid || header.b64 === false || header.crit !== undefined) {
    throw new Error("Algoritmo ou chave de assinatura não reconhecido.");
  }
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  if (!verify(null, Buffer.from(`${headerPart}.${payload}`), publicKey, Buffer.from(signature, "base64url"))) {
    throw new Error("Assinatura do TSE inválida. O boletim não foi publicado no painel.");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

/** Official unified schema discovered in the TSE application, not a guessed legacy JSON format. */
export function normalizeOfficialBulletin(input: unknown, config: FeedConfig, scope = "br", municipality?: string): NormalizedBulletin {
  const raw = record(input, "boletim");
  if (scope !== "br" && !OFFICIAL_UFS.includes(scope as typeof OFFICIAL_UFS[number])) throw new Error("Circunscrição desconhecida.");
  if (municipality !== undefined && (scope === "br" || !/^\d{5}$/.test(municipality))) throw new Error("Código municipal inválido.");
  if (String(raw.ele) !== config.electionId || String(raw.t) !== "2" || raw.f !== "o" || raw.tpabr !== (municipality ? "mu" : scope === "br" ? "br" : "uf") || raw.cdabr !== (municipality ?? scope)) {
    throw new Error("Boletim não corresponde ao segundo turno oficial e circunscrição configurados.");
  }
  const offices = list(raw.carg, "cargos").map((item) => record(item, "cargo"));
  if (offices.length !== 1 || String(offices[0].cd) !== "1") throw new Error("O boletim não contém exclusivamente presidente.");
  const candidates = list(offices[0].agr, "agremiações").flatMap((group) =>
    list(record(group, "agremiação").par, "partidos").flatMap((party) =>
      list(record(party, "partido").cand, "candidatos").map((candidate) => record(candidate, "candidato")),
    ),
  );
  if (candidates.length !== 2 || new Set(candidates.map((candidate) => String(candidate.n))).size !== 2) {
    throw new Error("Segundo turno exige dois candidatos distintos.");
  }
  const s = record(raw.s, "seções"), e = record(raw.e, "eleitorado"), v = record(raw.v, "votos");
  const total = count(s.ts, "seções totais"), counted = count(s.st, "seções totalizadas");
  if (total < 1 || counted > total) throw new Error("Contagem de seções inconsistente.");
  const electorate = count(e.te, "eleitorado"), turnout = count(e.c, "comparecimento");
  const abstention = count(e.a, "abstenção"), blank = count(v.vb, "brancos"), nullVotes = count(v.tvn, "nulos totais");
  const valid = count(v.vvc, "válidos"), notInstalledElectorate = count(e.esni, "seções não instaladas");
  if (turnout + abstention > electorate || notInstalledElectorate > electorate || count(v.tv, "votos totais") !== turnout || valid + blank + nullVotes !== turnout) {
    throw new Error("Totais de votos ou eleitorado inconsistentes.");
  }
  const normalized = ([['flavio', config.flavioId], ['lula', config.lulaId]] as const).map(([id, number]) => {
    const candidate = candidates.find((item) => String(item.n) === number);
    if (!candidate || typeof candidate.nmu !== "string" || !candidate.nmu.trim()) throw new Error("Identidade de candidato ausente no boletim.");
    const name = candidate.nmu.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (id === "flavio" ? !name.includes("FLAVIO") || !name.includes("BOLSONARO") : !name.includes("LULA")) {
      throw new Error("Nome e identificador do candidato divergem da configuração verificada.");
    }
    const votes = count(candidate.vap, "votos do candidato");
    return { id, name: candidate.nmu, votes, percent: valid === 0 ? 0 : votes / valid * 100 };
  }) as [NormalizedCandidate, NormalizedCandidate];
  if (normalized[0].votes + normalized[1].votes !== valid) throw new Error("Votos dos candidatos não fecham com os válidos.");
  if (counted === 0 && (turnout > 0 || abstention > 0)) throw new Error("Votos divulgados sem seções totalizadas.");
  if (raw.tf !== "s" && raw.tf !== "n") throw new Error("Estado de totalização desconhecido.");
  if (raw.tf === "s" && counted !== total) throw new Error("Totalização final sem todas as seções.");
  if (raw.tf === "s" && turnout + abstention + notInstalledElectorate !== electorate) {
    throw new Error("Eleitorado não fecha no boletim final, incluindo seções não instaladas.");
  }
  return {
    electionId: config.electionId, round: 2, generatedAt: sourceDate(raw.dg, raw.hg),
    sections: { total, counted, percent: counted / total * 100 }, candidates: normalized,
    blank, null: nullVotes, abstention, electorate, turnout, notInstalledElectorate,
    final: raw.tf === "s", states: [], statesComplete: false, statesReconciled: false,
    ...(municipality ? { scope: { type: "municipal" as const, uf: scope.toUpperCase(), municipality } } : {}),
  };
}

export function assertNoRegression(previous: NormalizedBulletin, next: NormalizedBulletin): void {
  if (previous.electionId !== next.electionId || previous.scope?.uf !== next.scope?.uf || previous.scope?.municipality !== next.scope?.municipality || next.generatedAt < previous.generatedAt || next.sections.counted < previous.sections.counted || next.turnout < previous.turnout || next.blank < previous.blank || next.null < previous.null || next.abstention < previous.abstention || next.notInstalledElectorate < previous.notInstalledElectorate || next.electorate !== previous.electorate || next.sections.total !== previous.sections.total || previous.final && !next.final || next.candidates.some((candidate, i) => candidate.votes < previous.candidates[i].votes)) {
    throw new Error("Boletim regressivo retido para revisão; o último dado válido foi preservado.");
  }
}

function reconcileStates(national: NormalizedBulletin, states: NormalizedState[], issues: string[]) {
  states.sort((a, b) => a.uf.localeCompare(b.uf));
  national.states = states;
  national.statesComplete = states.length === OFFICIAL_UFS.length && issues.length === 0;
  const sum = (field: "electorate" | "turnout" | "blank" | "null" | "abstention" | "notInstalledElectorate") => states.reduce((total, state) => total + state[field], 0);
  national.statesReconciled = national.statesComplete &&
    (["electorate", "turnout", "blank", "null", "abstention", "notInstalledElectorate"] as const).every((field) => sum(field) === national[field]) &&
    states.reduce((n, state) => n + state.sections.counted, 0) === national.sections.counted &&
    states.reduce((n, state) => n + state.sections.total, 0) === national.sections.total &&
    national.candidates.every((candidate, i) => states.reduce((n, state) => n + state.candidates[i].votes, 0) === candidate.votes);
}

export function createApuracaoService(options: {
  config: FeedConfig | null;
  fetch?: FeedFetcher;
  now?: () => number;
  publicKey?: Readonly<VerificationJwk>;
  timeoutMs?: number;
  collectStates?: boolean;
  persistence?: FeedPersistence;
  persistenceMode?: "persistent" | "ephemeral";
  municipality?: { uf: string; code: string };
}) {
  const config = options.config ? validateFeedConfig(options.config) : null;
  if (options.municipality && (!OFFICIAL_UFS.includes(options.municipality.uf.toLowerCase() as typeof OFFICIAL_UFS[number]) || !/^\d{5}$/.test(options.municipality.code) || options.collectStates || options.persistence)) throw new Error("Configuração municipal incompatível.");
  const requestedScope = options.municipality?.uf.toLowerCase() ?? "br";
  const requestUrl = config && options.municipality ? config.url.replace("/dados/br/br-", `/dados/${requestedScope}/${requestedScope}${options.municipality.code}-`) : config?.url;
  const fetcher = options.fetch ?? fetchOfficial, now = options.now ?? Date.now;
  let lastAttempt = -Infinity, fetchedAt: string | null = null;
  let nextAllowedAt = -Infinity;
  let data: NormalizedBulletin | null = null;
  let error: string | null = null;
  let stateIssues: string[] = [];
  let inFlight: Promise<void> | null = null;
  let initialization: Promise<void> | null = null;
  let nationalJws: string | null = null;
  const stateTokens = new Map<string, { uf: string; fetchedAt: string; jws: string }>();
  let restored = false, persistenceError: string | null = null;
  const snapshot = (): ApuracaoResponse => {
    let status: ApuracaoResponse["status"] = !config ? "unconfigured" : error ? data ? "stale" : "error" : data ? data.sections.counted === 0 ? "waiting" : "live" : "waiting";
    const oldSource = data && data.sections.counted > 0 && !data.final && now() - Date.parse(data.generatedAt) > SOURCE_MAX_AGE_MS;
    if (oldSource) status = "stale";
    if (data && stateIssues.length) status = "stale";
    return {
      status, source: "TSE", fetchedAt,
      attemptedAt: Number.isFinite(lastAttempt) ? new Date(lastAttempt).toISOString() : null,
      nextPollAt: Number.isFinite(nextAllowedAt) ? new Date(nextAllowedAt).toISOString() : null,
      message: !config ? "Configuração incompleta da divulgação. Informe todos os quatro parâmetros do TSE." : error ?? (oldSource ? "O TSE ainda não publicou um boletim recente. A hora original foi preservada." : stateIssues.length ? "Boletim nacional verificado; há circunscrições pendentes ou com dados retidos. Confira os horários individuais." : !data || data.sections.counted === 0 ? "TSE consultado. Aguardando início da totalização oficial." : data.final ? "Totalização oficial concluída pelo TSE." : "Boletim oficial do TSE com assinatura digital verificada."),
      data, stateIssues,
      persistence: {
        enabled: Boolean(options.persistence), restored, error: persistenceError,
        mode: options.persistence ? options.persistenceMode ?? "persistent" : "disabled",
        shared: false,
        message: !options.persistence ? "Sem histórico persistente para esta consulta." : options.persistenceMode === "ephemeral"
          ? "Histórico temporário nesta instância da hospedagem; pode desaparecer em reinícios ou diferir entre acessos. Não há cache compartilhado entre instâncias."
          : "Histórico salvo nesta instalação; não é compartilhado com outras instâncias.",
      },
    };
  };
  async function initialize() {
    if (!options.persistence || !config) return;
    try {
      const saved = await options.persistence.load();
      if (!saved) return;
      if (saved.schemaVersion !== 1 || saved.electionId !== config.electionId || !Array.isArray(saved.states) || !Array.isArray(saved.stateIssues)) throw new Error("Cache incompatível.");
      if (saved.stateIssues.some((uf) => typeof uf !== "string" || !OFFICIAL_UFS.includes(uf.toLowerCase() as typeof OFFICIAL_UFS[number]))) throw new Error("Lista de circunscrições em cache inválida.");
      for (const date of [saved.fetchedAt, saved.attemptedAt, saved.nextPollAt]) {
        if (!Number.isFinite(Date.parse(date)) || Date.parse(date) > now() + 300_000) throw new Error("Horário de cache inválido.");
      }
      const savedData = normalizeOfficialBulletin(verifyOfficialJws(saved.nationalJws, options.publicKey), config);
      if (Date.parse(savedData.generatedAt) > now() + 300_000) throw new Error("Horário da fonte em cache inválido.");
      const states: NormalizedState[] = [], seen = new Set<string>();
      for (const state of saved.states) {
        if (typeof state.uf !== "string" || !/^[A-Z]{2}$/.test(state.uf) || seen.has(state.uf) || !OFFICIAL_UFS.includes(state.uf.toLowerCase() as typeof OFFICIAL_UFS[number]) || !Number.isFinite(Date.parse(state.fetchedAt)) || Date.parse(state.fetchedAt) > now() + 300_000) throw new Error("Circunscrição em cache inválida.");
        seen.add(state.uf);
        const normalized = normalizeOfficialBulletin(verifyOfficialJws(state.jws, options.publicKey), config, state.uf.toLowerCase());
        if (Date.parse(normalized.generatedAt) > now() + 300_000) throw new Error("Horário da UF em cache inválido.");
        const { electionId: _id, round: _round, states: _states, statesComplete: _complete, statesReconciled: _reconciled, ...counts } = normalized;
        states.push({ ...counts, uf: state.uf, fetchedAt: state.fetchedAt });
        stateTokens.set(state.uf, state);
      }
      reconcileStates(savedData, states, saved.stateIssues);
      data = savedData; nationalJws = saved.nationalJws; fetchedAt = saved.fetchedAt;
      lastAttempt = Date.parse(saved.attemptedAt);
      nextAllowedAt = Math.min(Date.parse(saved.nextPollAt), now() + MIN_POLL_MS);
      stateIssues = saved.stateIssues;
      restored = true;
      error = "Último boletim assinado recuperado do cache local; aguardando nova consulta ao TSE. Horários originais preservados.";
    } catch {
      stateTokens.clear();
      persistenceError = "O cache local não pôde ser validado e foi ignorado. A consulta oficial continua disponível.";
    }
  }
  async function persist() {
    if (!options.persistence || !data || !nationalJws || !fetchedAt || !config) return;
    try {
      await options.persistence.save({
        schemaVersion: 1, electionId: config.electionId, fetchedAt,
        attemptedAt: new Date(lastAttempt).toISOString(), nextPollAt: new Date(nextAllowedAt).toISOString(),
        nationalJws, states: [...stateTokens.values()], stateIssues,
      });
      persistenceError = null;
    } catch {
      persistenceError = "Não foi possível salvar o cache ou o histórico local. Os dados em memória continuam disponíveis.";
    }
  }
  async function refresh() {
    lastAttempt = now();
    nextAllowedAt = lastAttempt + MIN_POLL_MS;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 10_000);
    try {
      const response = await fetcher(requestUrl!, { signal: controller.signal, redirect: "error", cache: "no-store", headers: { accept: "application/jose, text/plain" } });
      if (!response.ok) throw new Error(`TSE respondeu HTTP ${response.status}.`);
      const contentLength = response.headers.get("content-length");
      if (contentLength && Number(contentLength) > MAX_BODY_BYTES) throw new Error("Boletim excedeu o limite de tamanho.");
      const token = await response.text();
      const next = normalizeOfficialBulletin(verifyOfficialJws(token, options.publicKey), config!, requestedScope, options.municipality?.code);
      if (Date.parse(next.generatedAt) > now() + 300_000) throw new Error("Boletim contém horário futuro inconsistente.");
      if (data) assertNoRegression(data, next);
      const previousStates = data?.states ?? [];
      data = next; nationalJws = token; fetchedAt = new Date(now()).toISOString(); error = null; restored = false;
      if (options.collectStates) await refreshStates(next, previousStates);
    } catch (cause) {
      error = timedOut ? "Tempo limite ao consultar o TSE. Último boletim válido preservado." : cause instanceof Error ? cause.message : "Não foi possível consultar o TSE.";
    } finally {
      clearTimeout(timeout);
      // Wait after the entire cycle: a slow UF cannot be fetched again less than 30 s later.
      nextAllowedAt = now() + MIN_POLL_MS;
      await persist();
    }
  }
  async function refreshStates(national: NormalizedBulletin, previous: NormalizedState[]) {
    const states: NormalizedState[] = [], issues: string[] = [];
    let cursor = 0;
    // This is one collection cycle per 30 seconds, with at most four UF requests in flight.
    // National and state files are independently signed and may have different generation times.
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), options.timeoutMs ?? 20_000);
    async function worker() {
      while (cursor < OFFICIAL_UFS.length) {
        const uf = OFFICIAL_UFS[cursor++];
        const old = previous.find((state) => state.uf === uf.toUpperCase());
        try {
          if (deadline.signal.aborted) throw new Error("Tempo limite do ciclo de circunscrições.");
          const url = config!.url.replace("/dados/br/br-", `/dados/${uf}/${uf}-`);
          const response = await fetcher(url, { signal: deadline.signal, redirect: "error", cache: "no-store", headers: { accept: "application/jose, text/plain" } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const token = await response.text();
          const next = normalizeOfficialBulletin(verifyOfficialJws(token, options.publicKey), config!, uf);
          if (Date.parse(next.generatedAt) > now() + 300_000) throw new Error("Horário futuro inconsistente.");
          if (old) assertNoRegression({ ...old, electionId: national.electionId, round: 2, states: [], statesComplete: false, statesReconciled: false }, next);
          const { electionId: _electionId, round: _round, states: _states, statesComplete: _complete, statesReconciled: _reconciled, ...counts } = next;
          const receivedAt = new Date(now()).toISOString();
          states.push({ ...counts, uf: uf.toUpperCase(), fetchedAt: receivedAt });
          stateTokens.set(uf.toUpperCase(), { uf: uf.toUpperCase(), jws: token, fetchedAt: receivedAt });
          if (next.sections.counted > 0 && !next.final && now() - Date.parse(next.generatedAt) > SOURCE_MAX_AGE_MS) issues.push(uf.toUpperCase());
        } catch {
          issues.push(uf.toUpperCase());
          if (old) states.push(old);
        }
      }
    }
    try { await Promise.all(Array.from({ length: 4 }, () => worker())); }
    finally { clearTimeout(timer); }
    reconcileStates(national, states, issues);
    stateIssues = issues;
  }
  return {
    async get(): Promise<ApuracaoResponse> {
      if (!config) return snapshot();
      initialization ??= initialize();
      await initialization;
      if (inFlight) { await inFlight; return snapshot(); }
      if (now() >= nextAllowedAt) {
        inFlight = refresh().finally(() => { inFlight = null; });
        await inFlight;
      }
      return snapshot();
    },
  };
}

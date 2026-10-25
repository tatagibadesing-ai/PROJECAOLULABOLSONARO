#!/usr/bin/env node
/** Reproduce an exploratory national-error measurement from archived primary
 * polls and official TSE results. No election outcomes or errors are hardcoded. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { estimateNationalHistoricalError } from "../lib/historical-error.ts";

const root = resolve(import.meta.dirname, "..");
const json = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
const evidence = await json("dados/pesquisas-evidencias.json");
const manifest = await json("dados/originais/downloads-manifest.json");
const verification = await json("dados/verification.json");
const polls = evidence.polls.filter((poll) => poll.year < 2026 && poll.round === 2 && poll.scope === "BR" && poll.denominator === "valid" && poll.verification === "primary-publication");
const years = [...new Set(polls.map((poll) => poll.year))].sort();
const inputFiles = [];
const auditNotes = [];
const elections = [];

function fields(line) {
  const result = [];
  let quoted = false;
  let cell = "";
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (char === ";" && !quoted) { result.push(cell); cell = ""; }
    else if (char !== "\r") cell += char;
  }
  result.push(cell);
  return result;
}

function electionDateFromOfficialCsv(buffer) {
  const text = new TextDecoder("windows-1252").decode(gunzipSync(buffer));
  const endHeader = text.indexOf("\n");
  const header = fields(text.slice(0, endHeader));
  const roundColumn = header.indexOf("NR_TURNO");
  const dateColumn = header.indexOf("DT_ELEICAO");
  if (roundColumn < 0 || dateColumn < 0) throw new Error("CSV oficial sem turno/data.");
  let cursor = endHeader + 1;
  while (cursor < text.length) {
    const newline = text.indexOf("\n", cursor);
    const end = newline < 0 ? text.length : newline;
    const row = fields(text.slice(cursor, end));
    if (row[roundColumn] === "2") {
      const [day, month, year] = row[dateColumn].split("/");
      if (!day || !month || !year) throw new Error("Data oficial inválida.");
      return `${year}-${month}-${day}`;
    }
    cursor = end + 1;
  }
  throw new Error("CSV oficial sem segundo turno.");
}

for (const year of years) {
  const path = `public/data/round-2-${year}.json`;
  const rawBytes = await readFile(resolve(root, path));
  const actual = JSON.parse(rawBytes.toString("utf8"));
  inputFiles.push({ path, sha256: sha256(rawBytes) });
  // A consistent orientation is defined before looking at polling errors: the
  // candidate opposing PT in each second round, not the winner of that election.
  if (actual.candidates.length !== 2 || actual.candidates.filter((candidate) => candidate.party === "PT").length !== 1) throw new Error(`Orientação não identificada em ${year}.`);
  const candidate = actual.candidates.find((item) => item.party !== "PT");
  const sourcePath = `dados/originais/votacao_candidato_munzona_${year}_BR.csv.gz`;
  const source = manifest.sources.find((item) => item.path === sourcePath);
  if (!source) throw new Error(`Fonte oficial não catalogada em ${year}.`);
  const sourceBytes = await readFile(resolve(root, sourcePath));
  if (sha256(sourceBytes) !== source.sha256) throw new Error(`Checksum oficial divergente em ${year}.`);
  inputFiles.push({ path: sourcePath, sha256: source.sha256, sourceUrl: source.url });
  const date = electionDateFromOfficialCsv(sourceBytes);
  // Conservative leakage gate: use only polls completed before the official
  // election day. This is not an assertion about the historical publication hour.
  const resultGate = `${date}T00:00:00Z`;
  const asOf = new Date(Date.parse(resultGate) - 1).toISOString();
  const nationalVotes = Object.values(actual.national.votes).reduce((sum, value) => sum + value, 0);
  if (nationalVotes !== actual.national.valid) throw new Error(`Votos válidos não reconciliados em ${year}.`);
  for (const city of actual.cities) {
    const entries = Object.entries(city.votes);
    if (entries.some(([number, votes]) => !actual.candidates.some((runner) => runner.number === number) || !Number.isSafeInteger(votes) || votes < 0)) throw new Error(`Voto municipal inválido em ${city.id}.`);
    if (entries.reduce((sum, [, votes]) => sum + votes, 0) !== city.valid) throw new Error(`Válidos municipais não reconciliados em ${city.id}.`);
  }
  for (const runner of actual.candidates) {
    // Historical normalized maps are sparse. A missing candidate key contributes
    // zero only after the map has exhausted that municipality's official valid
    // total above, leaving no unassigned valid votes.
    const sum = actual.cities.reduce((total, city) => total + (city.votes[runner.number] ?? 0), 0);
    if (sum !== actual.national.votes[runner.number]) throw new Error(`Candidato ${runner.number} não reconciliado em ${year}.`);
  }
  const check = verification.checks.find((item) => item.file === path);
  if (!check) throw new Error(`Auditoria do resultado ausente em ${year}.`);
  if (check.status !== "passed") {
    const nonElectorate = check.errors.filter((error) => error.check !== "electorate");
    if (nonElectorate.length) throw new Error(`Resultado de ${year} tem divergências que afetam a análise de votos.`);
    auditNotes.push(`${year}: auditoria geral registra divergências de eleitorado; os votos válidos e votos de candidatos reconciliam separadamente. A análise nacional usa somente estes dois campos.`);
  }
  const electionPolls = [];
  for (const poll of polls.filter((item) => item.year === year)) {
    const measured = poll.candidates.find((item) => normalize(item.name) === normalize(candidate.name));
    if (!measured) throw new Error(`Identidade sem correspondência no documento ${poll.id}.`);
    const file = await readFile(resolve(root, poll.sourceFile));
    if (sha256(file) !== poll.sha256) throw new Error(`Checksum da pesquisa divergente: ${poll.id}.`);
    inputFiles.push({ path: poll.sourceFile, sha256: poll.sha256, sourceUrl: poll.sourceUrl });
    electionPolls.push({
      id: poll.id, institute: poll.institute, candidateId: candidate.number,
      candidateShare: measured.percent / 100, denominator: poll.denominator,
      sampleSize: poll.sample, fieldEnd: poll.fieldEnd,
      sourceUrl: poll.sourceUrl, sourceVerified: true,
      preElectionVersionVerified: false,
      registration: poll.registration,
      registrationVerified: poll.tseRegistrationVerified === true,
    });
  }
  elections.push({
    year, round: 2,
    orientation: "candidato adversário do PT em cada segundo turno, definido antes de calcular o erro",
    candidateId: candidate.number, candidateName: candidate.name,
    asOf, resultStartAt: resultGate,
    actual: { candidateId: candidate.number, candidateVotes: actual.national.votes[candidate.number], validVotes: actual.national.valid, sourceUrl: source.url, sourceVerified: true },
    polls: electionPolls,
  });
}

const result = estimateNationalHistoricalError(elections);
const report = {
  generatedAt: new Date().toISOString(),
  kind: "historical-national-polling-error",
  ...result,
  temporalGateNote: "Corte conservador no fim do dia anterior à data de eleição lida do CSV TSE; não se afirma o horário histórico de divulgação. O arquivo hoje arquivado não prova a versão pré-resultado do PDF.",
  scope: "Amostra parcial de pesquisas finais Datafolha; não representa o conjunto de institutos nem identifica a incerteza regional/municipal de 2026.",
  inputs: elections.map((election) => ({ year: election.year, candidateId: election.candidateId, candidateName: election.candidateName, asOf: election.asOf, actualSource: election.actual.sourceUrl, pollIds: election.polls.map((poll) => poll.id) })),
  inputFiles,
  auditNotes,
};
await mkdir(resolve(root, "public/data"), { recursive: true });
await writeFile(resolve(root, "public/data/historical-error.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, nElections: report.nElections, nPolls: report.nPolls, degreesFreedom: report.degreesFreedom, sigmaLogit: report.sigmaLogit, rmseLogit: report.rmseLogit, publicationReady: report.publicationReady, output: "public/data/historical-error.json" }, null, 2));

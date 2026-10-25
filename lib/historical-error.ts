/** National polling error on the log-odds scale. Polls are clustered by election:
 * five polls about one election still contribute one historical error, not five. */
export interface HistoricalPoll {
  id: string;
  institute: string;
  candidateId: string;
  candidateShare: number;
  denominator: "valid" | "total";
  sampleSize: number;
  fieldEnd: string;
  sourceUrl: string;
  sourceVerified: boolean;
  preElectionVersionVerified?: boolean;
  registration?: string | null;
  registrationVerified?: boolean;
}
export interface HistoricalElection {
  year: number;
  round: number;
  /** A caller-declared, consistent orientation, e.g. "candidate-A-series".
   * Individual identities can change across years but never between a poll and
   * the actual result for that election. Reversing only some years is forbidden. */
  orientation: string;
  candidateId: string;
  candidateName: string;
  asOf: string;
  resultStartAt: string;
  actual: {
    candidateId: string;
    candidateVotes: number;
    validVotes: number;
    sourceUrl: string;
    sourceVerified: boolean;
  };
  polls: HistoricalPoll[];
}
export interface ElectionPollingError {
  year: number;
  candidateId: string;
  candidateName: string;
  orientation: string;
  polls: { id: string; institute: string; share: number; weight: number; normalizedWeight: number; sourceUrl: string }[];
  actualSourceUrl: string;
  pollShare: number;
  actualShare: number;
  errorSharePp: number;
  errorMarginPp: number;
  errorLogit: number;
  limitations: string[];
}
export interface HistoricalErrorEstimate {
  status: "exploratory";
  orientation: string;
  nElections: number;
  nPolls: number;
  degreesFreedom: number;
  years: number[];
  meanErrorLogit: number;
  sigmaLogit: number;
  /** Alias of sample standard deviation, never a margin percentage. */
  sigma: number;
  rmseLogit: number;
  meanErrorSharePp: number;
  sampleStandardDeviationSharePp: number;
  rmseSharePp: number;
  errors: ElectionPollingError[];
  limitations: string[];
  identified: { nationalHistoricalDispersion: true; regionalCovariance: false; municipalVariance: false; probabilityCalibration: false };
  publicationReady: false;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function verifiedUrl(url: string, verified: boolean, official = false) {
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new Error("Fonte deve ter URL válida."); }
  ensure(parsed.protocol === "https:" && !parsed.username && !parsed.password, "Fonte deve usar HTTPS sem credenciais.");
  ensure(verified === true, "Fonte ainda não verificada.");
  if (official) ensure(parsed.hostname === "tse.jus.br" || parsed.hostname.endsWith(".tse.jus.br"), "Resultado oficial precisa de uma fonte TSE.");
}
function logit(share: number) {
  ensure(Number.isFinite(share) && share > 0 && share < 1, "Proporção logística precisa ficar estritamente entre 0 e 1.");
  return Math.log(share / (1 - share));
}
function mean(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function sd(values: number[]) {
  const center = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1));
}
function rmse(values: number[]) { return Math.sqrt(mean(values.map((value) => value ** 2))); }

/** One observation per election, regardless of the number of polls. Positive
 * errors mean the chosen candidate's actual share exceeded the polling mean. */
export function aggregateElectionPollingError(election: HistoricalElection, halfLifeDays = 5): ElectionPollingError {
  ensure(Number.isSafeInteger(election.year) && election.year >= 1989 && election.round === 2, "Amostra histórica deve ser de segundo turno presidencial.");
  ensure(typeof election.orientation === "string" && election.orientation.trim().length > 0, "Orientação entre candidatos precisa ser declarada.");
  ensure(election.candidateId && election.actual.candidateId === election.candidateId, "Identidade do candidato não corresponde ao resultado oficial.");
  ensure(Number.isFinite(halfLifeDays) && halfLifeDays > 0, "Meia-vida deve ser positiva.");
  const asOf = Date.parse(election.asOf);
  const resultStart = Date.parse(election.resultStartAt);
  ensure(Number.isFinite(asOf) && Number.isFinite(resultStart) && asOf < resultStart, "Corte de pesquisas precisa anteceder a divulgação do resultado.");
  const actual = election.actual;
  verifiedUrl(actual.sourceUrl, actual.sourceVerified, true);
  ensure(Number.isSafeInteger(actual.validVotes) && actual.validVotes > 0 && Number.isSafeInteger(actual.candidateVotes) && actual.candidateVotes > 0 && actual.candidateVotes < actual.validVotes, "Votos oficiais ou denominador inválidos.");
  ensure(Array.isArray(election.polls) && election.polls.length > 0, "Eleição sem pesquisas finais verificadas.");
  const limitations = new Set<string>();
  const seen = new Set<string>();
  const polls = election.polls.map((poll) => {
    ensure(typeof poll.id === "string" && poll.id.length > 0 && !seen.has(poll.id), "Pesquisa sem ID ou repetida na mesma eleição.");
    seen.add(poll.id);
    ensure(poll.candidateId === election.candidateId, "Identidade do candidato não corresponde entre pesquisa e resultado.");
    ensure(poll.denominator === "valid", "Erros históricos exigem votos válidos; votos totais não são convertidos implicitamente.");
    ensure(Number.isSafeInteger(poll.sampleSize) && poll.sampleSize > 0, "Amostra da pesquisa ausente ou inválida.");
    ensure(typeof poll.institute === "string" && poll.institute.trim().length > 0, "Instituto não identificado.");
    logit(poll.candidateShare);
    verifiedUrl(poll.sourceUrl, poll.sourceVerified);
    const end = Date.parse(poll.fieldEnd);
    ensure(Number.isFinite(end) && end <= asOf, "Campo de pesquisa futuro ou inválido em relação ao corte.");
    const ageDays = (asOf - end) / 86400000;
    ensure(ageDays <= 14, "Pesquisa fora da janela final histórica de 14 dias.");
    if (poll.preElectionVersionVerified !== true) limitations.add(`${election.year}: arquivo anterior à divulgação não comprovado para ${poll.id}.`);
    if (!poll.registration || poll.registrationVerified !== true) limitations.add(`${election.year}: cadastro TSE de ${poll.id} não verificado diretamente.`);
    return {
      id: poll.id, institute: poll.institute, share: poll.candidateShare,
      weight: Math.sqrt(poll.sampleSize) * 2 ** (-ageDays / halfLifeDays),
      sourceUrl: poll.sourceUrl,
    };
  });
  const totalWeight = polls.reduce((sum, poll) => sum + poll.weight, 0);
  const pollShare = polls.reduce((sum, poll) => sum + poll.share * poll.weight, 0) / totalWeight;
  const actualShare = actual.candidateVotes / actual.validVotes;
  return {
    year: election.year, candidateId: election.candidateId, candidateName: election.candidateName,
    orientation: election.orientation,
    polls: polls.map((poll) => ({ ...poll, normalizedWeight: poll.weight / totalWeight })),
    actualSourceUrl: actual.sourceUrl,
    pollShare, actualShare,
    errorSharePp: (actualShare - pollShare) * 100,
    errorMarginPp: (actualShare - pollShare) * 200,
    errorLogit: logit(actualShare) - logit(pollShare),
    limitations: [...limitations],
  };
}

/** Estimate dispersion across independent election outcomes, not across poll
 * rows. With three elections there are only two residual degrees of freedom.
 * This does not estimate regional/municipal noise or calibrate win chances. */
export function estimateNationalHistoricalError(elections: HistoricalElection[], halfLifeDays = 5): HistoricalErrorEstimate {
  ensure(Array.isArray(elections) && elections.length >= 3, "São necessárias pelo menos três eleições distintas, não três pesquisas.");
  ensure(new Set(elections.map((election) => election.year)).size === elections.length, "Eleição repetida: agregue suas pesquisas antes de calcular a dispersão histórica.");
  ensure(new Set(elections.map((election) => election.orientation)).size === 1, "Orientação de candidatos precisa ser consistente entre eleições.");
  const errors = elections.map((election) => aggregateElectionPollingError(election, halfLifeDays)).sort((a, b) => a.year - b.year);
  const logitErrors = errors.map((error) => error.errorLogit);
  const shareErrors = errors.map((error) => error.errorSharePp);
  const institutes = new Set(errors.flatMap((error) => error.polls.map((poll) => poll.institute)));
  const limitations = [
    `${errors.length} eleições oferecem somente ${errors.length - 1} graus de liberdade para a dispersão residual: a estimativa é exploratória.`,
    "Os anos recebem o mesmo peso. Pesquisas da mesma eleição são agregadas antes do cálculo e não aumentam o número de resultados independentes.",
    "Média do erro mede viés observado; desvio amostral mede dispersão após centralização; RMSE inclui viés. As três medidas não são intercambiáveis.",
    "A série depende da escolha explícita da orientação dos candidatos. Inverter a identidade em somente um ano invalida a comparação.",
    "Percentuais publicados arredondados limitam a precisão dos erros; pesos de amostra e recência não removem erros metodológicos compartilhados.",
    "Covariância regional, variância municipal e cobertura de intervalos não são identificadas por estes erros nacionais. Nenhuma chance de vitória é validada aqui.",
    "Diferenças entre eleições e seleção incompleta de institutos limitam a transferência desse desvio para 2026.",
    ...(institutes.size === 1 ? ["A série reúne apenas um instituto; não estima o erro da média de todos os institutos."] : []),
    ...errors.flatMap((error) => error.limitations),
  ];
  const sigma = sd(logitErrors);
  return {
    status: "exploratory",
    orientation: errors[0].orientation,
    nElections: errors.length,
    nPolls: errors.reduce((sum, error) => sum + error.polls.length, 0),
    degreesFreedom: errors.length - 1,
    years: errors.map((error) => error.year),
    meanErrorLogit: mean(logitErrors), sigmaLogit: sigma, sigma,
    rmseLogit: rmse(logitErrors),
    meanErrorSharePp: mean(shareErrors),
    sampleStandardDeviationSharePp: sd(shareErrors),
    rmseSharePp: rmse(shareErrors),
    errors, limitations,
    identified: { nationalHistoricalDispersion: true, regionalCovariance: false, municipalVariance: false, probabilityCalibration: false },
    publicationReady: false,
  };
}

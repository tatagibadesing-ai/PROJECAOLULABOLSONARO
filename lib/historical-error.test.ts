import test from "node:test";
import assert from "node:assert/strict";
import { aggregateElectionPollingError, estimateNationalHistoricalError, type HistoricalElection } from "./historical-error";

// Only synthetic fixtures are used here. Production measurements load archived
// primary publications and official TSE result files; no historical values are baked in.
function election(year: number, actualShare = 0.5, pollShare = 0.5): HistoricalElection {
  return {
    year, round: 2, orientation: "candidate-A-series", candidateId: `candidate-${year}`, candidateName: `Candidato ${year}`,
    asOf: `${year}-10-29T23:59:59Z`, resultStartAt: `${year}-10-30T20:00:00Z`,
    actual: { candidateId: `candidate-${year}`, candidateVotes: Math.round(100000 * actualShare), validVotes: 100000, sourceUrl: `https://dadosabertos.tse.jus.br/fixture/${year}`, sourceVerified: true },
    polls: [{ id: `poll-${year}`, institute: "Instituto sintético", candidateId: `candidate-${year}`, candidateShare: pollShare, denominator: "valid", sampleSize: 1000, fieldEnd: `${year}-10-29`, sourceUrl: `https://example.org/fixture/${year}`, sourceVerified: true, preElectionVersionVerified: true, registration: `FIXTURE-${year}`, registrationVerified: true }],
  };
}

test("sigma usa erros logísticos, sinal resultado menos pesquisa e desvio amostral entre eleições", () => {
  const data = [election(2000, 0.5, 0.4), election(2004, 0.5, 0.5), election(2008, 0.5, 0.6)];
  const result = estimateNationalHistoricalError(data);
  const expected = Math.log(1.5);
  assert.ok(result.errors[0].errorLogit > 0);
  assert.ok(result.errors[2].errorLogit < 0);
  assert.ok(Math.abs(result.meanErrorLogit) < 1e-12);
  assert.ok(Math.abs(result.sigmaLogit - expected) < 1e-12);
  assert.ok(Math.abs(result.rmseLogit - expected * Math.sqrt(2 / 3)) < 1e-12);
  assert.equal(result.sigma, result.sigmaLogit);
  assert.equal(result.nElections, 3);
  assert.equal(result.degreesFreedom, 2);
  assert.equal(result.publicationReady, false);
  assert.equal(result.identified.regionalCovariance, false);
});

test("viés comum não é confundido com desvio residual ou RMSE", () => {
  const result = estimateNationalHistoricalError([election(2000, 0.55, 0.5), election(2004, 0.55, 0.5), election(2008, 0.55, 0.5)]);
  assert.ok(Math.abs(result.sigmaLogit) < 1e-12);
  assert.ok(result.meanErrorLogit > 0);
  assert.ok(Math.abs(result.rmseLogit - result.meanErrorLogit) < 1e-12);
  assert.ok(Math.abs(result.meanErrorSharePp - 5) < 1e-10);
});

test("dez pesquisas da mesma eleição contam como uma eleição e agregam amostra/recência", () => {
  const one = election(2000, 0.5, 0.4);
  one.polls = Array.from({ length: 10 }, (_, index) => ({ ...one.polls[0], id: `poll-${index}` }));
  assert.throws(() => estimateNationalHistoricalError([one]), /três eleições distintas/);
  const result = estimateNationalHistoricalError([one, election(2004), election(2008)]);
  assert.equal(result.nElections, 3);
  assert.equal(result.nPolls, 12);
  assert.equal(result.degreesFreedom, 2);
  assert.ok(Math.abs(result.errors[0].pollShare - 0.4) < 1e-12);
  assert.throws(() => estimateNationalHistoricalError([one, one, election(2004)]), /Eleição repetida/);
  const weighted = election(2000);
  weighted.asOf = "2000-10-29T00:00:00Z";
  weighted.polls = [{ ...weighted.polls[0], id: "a", candidateShare: 0.4 }, { ...weighted.polls[0], id: "b", candidateShare: 0.6, sampleSize: 4000, fieldEnd: "2000-10-24" }];
  const aggregate = aggregateElectionPollingError(weighted);
  assert.ok(Math.abs(aggregate.pollShare - 0.5) < 1e-12);
});

test("identidade e orientação precisam corresponder entre pesquisa, resultado e anos", () => {
  const invalid = election(2000);
  invalid.polls[0].candidateId = "outro-candidato";
  assert.throws(() => aggregateElectionPollingError(invalid), /Identidade/);
  const changedOrientation = { ...election(2008), orientation: "candidate-B-series" };
  assert.throws(() => estimateNationalHistoricalError([election(2000), election(2004), changedOrientation]), /Orientação/);
});

test("denominadores inválidos, fontes não verificadas, campo futuro e duplicatas são recusados", () => {
  const invalid = election(2000);
  invalid.polls[0].denominator = "total";
  assert.throws(() => aggregateElectionPollingError(invalid), /votos válidos/);
  const unverified = election(2000);
  unverified.actual.sourceVerified = false;
  assert.throws(() => aggregateElectionPollingError(unverified), /não verificada/);
  const future = election(2000);
  future.polls[0].fieldEnd = "2000-10-30";
  assert.throws(() => aggregateElectionPollingError(future), /Campo/);
  const zero = election(2000);
  zero.polls[0].candidateShare = 0;
  assert.throws(() => aggregateElectionPollingError(zero), /estritamente/);
  const duplicate = election(2000);
  duplicate.polls.push(duplicate.polls[0]);
  assert.throws(() => aggregateElectionPollingError(duplicate), /repetida/);
});

test("limitações de fonte antiga, registro e instituto único continuam explícitas", () => {
  const data = [election(2000), election(2004), election(2008)];
  data[0].polls[0].registrationVerified = false;
  data[1].polls[0].preElectionVersionVerified = false;
  const result = estimateNationalHistoricalError(data);
  assert.ok(result.limitations.some((limitation) => limitation.includes("apenas um instituto")));
  assert.ok(result.limitations.some((limitation) => limitation.includes("arquivo anterior")));
  assert.ok(result.limitations.some((limitation) => limitation.includes("cadastro TSE")));
  assert.equal(result.status, "exploratory");
});

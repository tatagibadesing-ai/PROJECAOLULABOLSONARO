/* Shared, dependency-free simulation kernel. A conditional scenario carries its data and
 * assumption provenance, but is never certified for publication by running this kernel.
 * This module runs unchanged in a browser Web Worker and in the Node test runner. */
export const DESTINATIONS = ["flavio", "lula", "blank", "null", "abstention"];
const EPS = 1e-12;
const BINS = 1000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function finite(value, name) {
  assert(typeof value === "number" && Number.isFinite(value), `${name}: número finito obrigatório.`);
  return value;
}

function proportion(value, name) {
  finite(value, name);
  assert(value >= 0 && value <= 1, `${name}: deve ficar entre 0 e 1.`);
  return value;
}

function safeCount(value, name) {
  assert(Number.isSafeInteger(value) && value >= 0, `${name}: inteiro não negativo obrigatório.`);
  return value;
}

function logistic(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function logit(value) {
  return Math.log(Math.max(EPS, Math.min(1 - EPS, value)) / Math.max(EPS, 1 - Math.min(1 - EPS, value)));
}

/** Hamilton/largest remainder: integers with exactly the requested total. */
export function allocateIntegers(total, weights, tieSeed) {
  safeCount(total, "Eleitorado");
  assert(Array.isArray(weights) && weights.length > 0, "Distribuição vazia.");
  weights.forEach((weight) => assert(finite(weight, "Peso") >= 0, "Peso negativo."));
  const sum = weights.reduce((a, b) => a + b, 0);
  assert(Number.isFinite(sum), "Soma dos pesos inválida.");
  if (total === 0) return weights.map(() => 0);
  assert(sum > 0, "Não é possível distribuir eleitores sem pesos positivos.");
  const raw = weights.map((weight) => total * weight / sum);
  const values = raw.map(Math.floor);
  let remaining = total - values.reduce((a, b) => a + b, 0);
  const tieOrder = weights.map((_, index) => index);
  if (tieSeed != null) {
    const random = randomGenerator(tieSeed);
    for (let index = tieOrder.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [tieOrder[index], tieOrder[other]] = [tieOrder[other], tieOrder[index]];
    }
  }
  const tieRank = [];
  tieOrder.forEach((index, rank) => { tieRank[index] = rank; });
  const rank = raw.map((value, index) => ({ index, remainder: value - values[index] }))
    .sort((a, b) => b.remainder - a.remainder || tieRank[a.index] - tieRank[b.index]);
  assert(remaining >= 0 && remaining <= rank.length, "Arredondamento fora da precisão suportada.");
  for (let i = 0; i < remaining; i++) values[rank[i].index]++;
  return values;
}

/** Internal fixed-five allocator. Inputs have already been validated; scratch buffers
 * avoid per-city object sorting/allocation in the 100+ million draw production loop.
 * Reservoir sampling chooses uniformly among exactly tied largest remainders. */
function allocateFiveInto(total, a, b, c, d, e, values, remainders, random) {
  const scale = total / (a + b + c + d + e);
  // Mathematically equal weights can differ by a few ulps after rate algebra.
  // Treat only errors below the count arithmetic precision as a tie.
  const tolerance = Math.max(EPS, total * Number.EPSILON * 8);
  let raw = a * scale; values[0] = Math.floor(raw); remainders[0] = raw - values[0];
  raw = b * scale; values[1] = Math.floor(raw); remainders[1] = raw - values[1];
  raw = c * scale; values[2] = Math.floor(raw); remainders[2] = raw - values[2];
  raw = d * scale; values[3] = Math.floor(raw); remainders[3] = raw - values[3];
  raw = e * scale; values[4] = Math.floor(raw); remainders[4] = raw - values[4];
  let remaining = total - values[0] - values[1] - values[2] - values[3] - values[4];
  while (remaining > 0) {
    let best = -1, bestRemainder = -1, tied = 0;
    for (let i = 0; i < 5; i++) {
      const remainder = remainders[i];
      if (remainder < 0) continue;
      if (remainder - bestRemainder > tolerance) { best = i; bestRemainder = remainder; tied = 1; }
      else if (Math.abs(remainder - bestRemainder) <= tolerance && random() * ++tied < 1) best = i;
    }
    // No category receives more than one largest-remainder unit.
    values[best]++;
    remainders[best] = -1;
    remaining--;
  }
}

/** Calibrate valid-vote shares with a common log-odds shift and valid-vote weights.
 * For target 0/1 the limit is exact. Interior endpoints get epsilon mass so a valid
 * aggregate target always remains reachable; no additive percentage correction. */
export function calibrateShares(shares, weights, target) {
  assert(Array.isArray(shares) && shares.length > 0 && shares.length === weights.length, "Calibração: dimensões incompatíveis.");
  proportion(target, "Alvo");
  shares.forEach((share) => proportion(share, "Proporção"));
  weights.forEach((weight) => assert(finite(weight, "Peso") >= 0, "Peso negativo."));
  const total = weights.reduce((a, b) => a + b, 0);
  assert(total > 0 && Number.isFinite(total), "Calibração sem votos válidos.");
  if (target === 0 || target === 1) return shares.map(() => target);
  let lower = -60;
  let upper = 60;
  for (let step = 0; step < 100; step++) {
    const delta = (lower + upper) / 2;
    const mean = shares.reduce((sum, share, i) => sum + logistic(logit(share) + delta) * weights[i], 0) / total;
    if (mean < target) lower = delta;
    else upper = delta;
  }
  const delta = (lower + upper) / 2;
  return shares.map((share) => logistic(logit(share) + delta));
}

/** Weighted mean is evidence only when metadata/denominator are verified.
 * A house bias, if provided, is subtracted and must carry historical evidence.
 * Shares are fractions; sample size is people; half-life is days. */
export function weightedPollAverage(polls, asOf, halfLifeDays = 5) {
  assert(Array.isArray(polls), "Pesquisas: lista obrigatória.");
  const now = new Date(asOf).getTime();
  assert(Number.isFinite(now), "Data de referência inválida.");
  assert(finite(halfLifeDays, "Meia-vida") > 0, "Meia-vida deve ser positiva.");
  const included = [];
  const excluded = [];
  for (const poll of polls) {
    let reason = null;
    const fieldEnd = new Date(poll.fieldEnd).getTime();
    if (poll.verified !== true) reason = "Fonte não verificada";
    else if (!poll.registration || typeof poll.registration !== "string") reason = "Registro ausente";
    else if (poll.denominator !== "valid") reason = "Denominador não é votos válidos";
    else if (!Number.isSafeInteger(poll.sampleSize) || poll.sampleSize <= 0) reason = "Amostra desconhecida";
    else if (!Number.isFinite(fieldEnd) || fieldEnd > now) reason = "Data de campo inválida ou futura";
    else if (typeof poll.flavioShare !== "number" || !Number.isFinite(poll.flavioShare) || poll.flavioShare < 0 || poll.flavioShare > 1) reason = "Proporção inválida";
    else if (poll.houseBias != null && (!Number.isFinite(poll.houseBias) || Math.abs(poll.houseBias) > 1 || !poll.biasEvidence)) reason = "Correção de instituto sem evidência válida";
    if (reason) {
      excluded.push({ registration: poll.registration ?? null, reason });
      continue;
    }
    const ageDays = (now - fieldEnd) / 86400000;
    const weight = Math.sqrt(poll.sampleSize) * 2 ** (-ageDays / halfLifeDays);
    const adjustedShare = poll.flavioShare - (poll.houseBias ?? 0);
    if (adjustedShare < 0 || adjustedShare > 1) {
      excluded.push({ registration: poll.registration, reason: "Correção fora de 0–1" });
      continue;
    }
    included.push({ registration: poll.registration, weight, adjustedShare });
  }
  const totalWeight = included.reduce((sum, poll) => sum + poll.weight, 0);
  return {
    flavioShare: totalWeight > 0 ? included.reduce((sum, poll) => sum + poll.adjustedShare * poll.weight, 0) / totalWeight : null,
    included: included.map((poll) => ({ ...poll, normalizedWeight: totalWeight > 0 ? poll.weight / totalWeight : 0 })),
    excluded,
  };
}

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    // Keep the state uint32: 100+ million draws otherwise exceed Number's exact
    // integer range and change low bits of the generator during a municipal run.
    value = (value + 0x6D2B79F5) >>> 0;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  return Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, random()))) * Math.cos(2 * Math.PI * random());
}

function quantile(sorted, q) {
  const at = (sorted.length - 1) * q;
  const lower = Math.floor(at);
  return sorted[lower] + (sorted[Math.ceil(at)] - sorted[lower]) * (at - lower);
}

function accumulator(id, electorate, simulations, exact = false) {
  const countBins = Math.min(BINS, electorate);
  return {
    id, electorate, exact, countBins, draws: 0,
    countSums: [0, 0, 0, 0, 0], countMin: [Infinity, Infinity, Infinity, Infinity, Infinity], countMax: [0, 0, 0, 0, 0],
    countSamples: Array.from({ length: 5 }, () => new Uint32Array(exact ? simulations : countBins + 1)),
    shareSum: 0, samples: exact ? new Float64Array(simulations) : new Uint32Array(BINS + 1),
    validDraws: 0, wins: [0, 0], ties: 0,
  };
}

function collect(acc, counts) {
  for (let index = 0; index < 5; index++) {
    const value = counts[index];
    acc.countSums[index] += value;
    if (value < acc.countMin[index]) acc.countMin[index] = value;
    if (value > acc.countMax[index]) acc.countMax[index] = value;
    if (acc.exact) acc.countSamples[index][acc.draws] = value;
    else acc.countSamples[index][acc.electorate > 0 ? Math.round(value / acc.electorate * acc.countBins) : 0]++;
  }
  acc.draws++;
  const valid = counts[0] + counts[1];
  if (valid === 0) {
    acc.ties++;
    return;
  }
  const share = counts[0] / valid;
  acc.shareSum += share;
  if (acc.exact) acc.samples[acc.validDraws] = share;
  else acc.samples[Math.round(share * BINS)]++;
  acc.validDraws++;
  if (counts[0] > counts[1]) acc.wins[0]++;
  else if (counts[1] > counts[0]) acc.wins[1]++;
  else acc.ties++;
}

function histogramQuantile(samples, total, q) {
  let cumulative = 0;
  const target = Math.max(1, Math.ceil(total * q));
  for (let bin = 0; bin < samples.length; bin++) {
    cumulative += samples[bin];
    if (cumulative >= target) return samples.length > 1 ? bin / (samples.length - 1) : 0;
  }
  return 1;
}

function summarize(acc, simulations) {
  const sorted = acc.exact ? acc.samples.subarray(0, acc.validDraws).sort() : null;
  const interval = acc.validDraws === 0 ? null : acc.exact
    ? [quantile(sorted, 0.1), quantile(sorted, 0.9)]
    : [histogramQuantile(acc.samples, acc.validDraws, 0.1), histogramQuantile(acc.samples, acc.validDraws, 0.9)];
  const share = acc.validDraws > 0 ? acc.shareSum / acc.validDraws : null;
  const countsInterval = {};
  for (let destination = 0; destination < 5; destination++) {
    if (acc.exact) {
      const samples = acc.countSamples[destination].sort();
      countsInterval[DESTINATIONS[destination]] = [Math.floor(quantile(samples, .1)), Math.ceil(quantile(samples, .9))];
    } else {
      const samples = acc.countSamples[destination];
      // Round outward from the entire quantization bin and clip to observed range.
      // For electorates <=1000 each bin is already an exact integer count.
      const halfBin = acc.electorate > BINS ? acc.electorate / acc.countBins / 2 : 0;
      countsInterval[DESTINATIONS[destination]] = [
        Math.max(acc.countMin[destination], Math.floor(histogramQuantile(samples, simulations, .1) * acc.electorate - halfBin)),
        Math.min(acc.countMax[destination], Math.ceil(histogramQuantile(samples, simulations, .9) * acc.electorate + halfBin)),
      ];
    }
  }
  return {
    id: acc.id,
    flavio: { share, interval, winProbability: acc.wins[0] / simulations },
    lula: { share: share == null ? null : 1 - share, interval: interval == null ? null : [1 - interval[1], 1 - interval[0]], winProbability: acc.wins[1] / simulations },
    tieProbability: acc.ties / simulations,
    counts: Object.fromEntries(DESTINATIONS.map((name, index) => [name, acc.countSums[index] / simulations])),
    countsInterval,
    countsIntervalResolution: acc.exact || acc.electorate <= BINS ? "exact" : Math.ceil(acc.electorate / BINS),
    electorate: acc.electorate,
    intervalResolution: acc.exact ? "exact" : 1 / BINS,
  };
}

/** Assumption-based and synthetic simulations share the same mathematics. Running this
 * kernel never certifies historical coverage, source completeness or publication. */
export function runSimulation(input, onProgress) {
  assert(input && (input.scenario === "synthetic" || input.scenario === "conditional"), "Este motor está habilitado apenas para cenários sintéticos ou condicionais, não para uma projeção eleitoral publicável.");
  let provenance = null;
  if (input.scenario === "conditional") {
    const candidate = input.provenance;
    assert(candidate && typeof candidate.label === "string" && candidate.label.trim() && typeof candidate.assumptionsVersion === "string" && candidate.assumptionsVersion.trim(), "Cenário condicional exige proveniência e versão das premissas.");
    for (const field of ["sources", "limitations"]) assert(Array.isArray(candidate[field]) && candidate[field].length > 0 && candidate[field].every((value) => typeof value === "string" && value.trim()), `Proveniência: ${field} deve ser uma lista não vazia de textos.`);
    provenance = { label: candidate.label, assumptionsVersion: candidate.assumptionsVersion, sources: [...candidate.sources], limitations: [...candidate.limitations] };
  }
  const simulations = input.simulations ?? 20000;
  assert(Number.isInteger(simulations) && simulations >= 1 && simulations <= 100000, "Número de simulações deve ser inteiro entre 1 e 100.000.");
  const seed = input.seed ?? 2026;
  assert(Number.isInteger(seed) && seed >= 0 && seed <= 4294967295, "Semente deve ser um inteiro uint32.");
  assert(Array.isArray(input.cities) && input.cities.length > 0 && input.cities.length <= 6000, "Cenário deve conter de 1 a 6.000 municípios.");
  const uncertainty = { national: 0, regional: 0, city: 0, turnout: 0, invalid: 0, ...input.uncertainty };
  for (const key of Object.keys(uncertainty)) assert(finite(uncertainty[key], `Incerteza ${key}`) >= 0 && uncertainty[key] <= 3, "Desvio deve ficar entre 0 e 3 na escala logística.");
  const ids = new Set();
  let electorate = 0;
  const cities = input.cities.map((city) => {
    assert(typeof city.id === "string" && city.id.length > 0 && !ids.has(city.id), "ID de município ausente ou duplicado.");
    ids.add(city.id);
    assert(typeof city.state === "string" && city.state.length > 0 && typeof city.region === "string" && city.region.length > 0, "UF e região obrigatórias.");
    safeCount(city.electorate, `Eleitorado ${city.id}`);
    electorate += city.electorate;
    assert(Array.isArray(city.groups) && city.groups.length > 0, "Grupos de origem obrigatórios.");
    const expected = [0, 0, 0, 0, 0];
    let sources = 0;
    const groupIds = new Set();
    for (const group of city.groups) {
      assert(typeof group.id === "string" && group.id.length > 0 && !groupIds.has(group.id), "ID de grupo ausente ou duplicado.");
      groupIds.add(group.id);
      sources += safeCount(group.count, "Contagem do grupo");
      assert(Array.isArray(group.transfer) && group.transfer.length === 5, "Cada transferência precisa de cinco destinos.");
      group.transfer.forEach((value) => proportion(value, "Transferência"));
      assert(Math.abs(group.transfer.reduce((a, b) => a + b, 0) - 1) < 1e-9, "Cada linha de transferência deve somar 1.");
      for (let i = 0; i < 5; i++) expected[i] += group.count * group.transfer[i];
    }
    assert(sources === city.electorate, `Grupos não fecham com o eleitorado de ${city.id}.`);
    const valid = expected[0] + expected[1];
    const turnout = city.electorate - expected[4];
    const invalid = expected[2] + expected[3];
    return {
      id: city.id, state: city.state, region: city.region, electorate: city.electorate,
      share: valid > 0 ? expected[0] / valid : 0.5, valid,
      turnoutRate: city.electorate > 0 ? turnout / city.electorate : 0,
      invalidRate: turnout > 0 ? invalid / turnout : 0,
      blankShare: invalid > 0 ? expected[2] / invalid : 0.5,
    };
  });
  safeCount(electorate, "Eleitorado total");
  assert(electorate <= 1e9, "Eleitorado acima do limite de precisão suportado (1 bilhão).");
  if (input.targetShare != null) {
    const calibrated = calibrateShares(cities.map((city) => city.share), cities.map((city) => city.valid), input.targetShare);
    cities.forEach((city, index) => { city.share = calibrated[index]; });
  }
  const regions = [...new Set(cities.map((city) => city.region))].sort();
  const states = [...new Set(cities.map((city) => city.state))].sort();
  // A state cannot belong to multiple macroregions. Exterior should use its own region.
  for (const state of states) assert(new Set(cities.filter((city) => city.state === state).map((city) => city.region)).size === 1, "Uma UF não pode pertencer a duas regiões.");
  const stateIndex = new Map(states.map((state, index) => [state, index]));
  const regionIndex = new Map(regions.map((region, index) => [region, index]));
  const stateElectorates = states.map(() => 0);
  cities.forEach((city) => {
    city.stateIndex = stateIndex.get(city.state);
    city.regionIndex = regionIndex.get(city.region);
    stateElectorates[city.stateIndex] += city.electorate;
    // Endpoints intentionally stay infinite so adding finite noise preserves 0/1.
    city.shareLogit = Math.log(city.share / (1 - city.share));
    city.turnoutLogit = Math.log(city.turnoutRate / (1 - city.turnoutRate));
    city.invalidLogit = Math.log(city.invalidRate / (1 - city.invalidRate));
  });
  const random = randomGenerator(seed);
  const nationalAcc = accumulator("BR", electorate, simulations, true);
  const stateAcc = states.map((state, index) => accumulator(state, stateElectorates[index], simulations, true));
  const cityAcc = cities.map((city) => accumulator(city.id, city.electorate, simulations));
  const counts = [0, 0, 0, 0, 0], remainders = [0, 0, 0, 0, 0];
  const regionalErrors = regions.map(() => 0);
  const total = [0, 0, 0, 0, 0];
  const stateTotals = states.map(() => [0, 0, 0, 0, 0]);
  let violations = 0;
  let minCount = Infinity;
  let drawsChecked = 0;
  for (let draw = 0; draw < simulations; draw++) {
    const nationalError = gaussian(random) * uncertainty.national;
    const turnoutError = uncertainty.turnout ? gaussian(random) * uncertainty.turnout : 0;
    const invalidError = uncertainty.invalid ? gaussian(random) * uncertainty.invalid : 0;
    for (let index = 0; index < regions.length; index++) regionalErrors[index] = gaussian(random) * uncertainty.regional;
    total.fill(0);
    for (let index = 0; index < states.length; index++) stateTotals[index].fill(0);
    for (let index = 0; index < cities.length; index++) {
      const city = cities[index];
      const error = nationalError + regionalErrors[city.regionIndex] + gaussian(random) * uncertainty.city;
      const share = error === 0 ? city.share : logistic(city.shareLogit + error);
      const turnoutRate = turnoutError === 0 ? city.turnoutRate : logistic(city.turnoutLogit + turnoutError);
      const invalidRate = invalidError === 0 ? city.invalidRate : logistic(city.invalidLogit + invalidError);
      const validRate = turnoutRate * (1 - invalidRate);
      const invalidRateElectorate = turnoutRate * invalidRate;
      allocateFiveInto(city.electorate, validRate * share, validRate * (1 - share), invalidRateElectorate * city.blankShare, invalidRateElectorate * (1 - city.blankShare), 1 - turnoutRate, counts, remainders, random);
      let sum = 0, invalid = false;
      for (let destination = 0; destination < 5; destination++) {
        const value = counts[destination];
        sum += value;
        if (value < 0 || !Number.isSafeInteger(value)) invalid = true;
        if (value < minCount) minCount = value;
      }
      if (sum !== city.electorate || invalid) violations++;
      drawsChecked++;
      collect(cityAcc[index], counts);
      const localState = stateTotals[city.stateIndex];
      for (let destination = 0; destination < 5; destination++) {
        total[destination] += counts[destination];
        localState[destination] += counts[destination];
      }
    }
    collect(nationalAcc, total);
    stateTotals.forEach((counts, index) => collect(stateAcc[index], counts));
    if (onProgress && ((draw + 1) % 1000 === 0 || draw === simulations - 1)) onProgress((draw + 1) / simulations);
  }
  const margins = nationalAcc.samples.subarray(0, nationalAcc.validDraws).map((share) => (2 * share - 1) * 100);
  let histogram = [];
  if (margins.length) {
    const low = Math.floor(margins.reduce((minimum, margin) => Math.min(minimum, margin), Infinity));
    const high = Math.ceil(margins.reduce((maximum, margin) => Math.max(maximum, margin), -Infinity));
    const width = Math.max(0.25, (high - low) / 40);
    histogram = Array.from({ length: 41 }, (_, index) => ({ margin: Math.max(-100, Math.min(100, low + (index + 0.5) * width)), count: 0 }));
    margins.forEach((margin) => histogram[Math.max(0, Math.min(40, Math.floor((margin - low) / width)))].count++);
  }
  return {
    scenario: input.scenario,
    label: input.scenario === "synthetic" ? "Laboratório sintético — não é projeção eleitoral nem resultado oficial" : provenance.label,
    provenance,
    publicationReady: false,
    coverageValidated: false,
    simulations, seed,
    uncertainty: { ...uncertainty, estimatedFromHistory: false },
    national: summarize(nationalAcc, simulations),
    states: stateAcc.map((acc) => summarize(acc, simulations)),
    cities: cityAcc.map((acc, index) => ({ ...summarize(acc, simulations), state: cities[index].state, region: cities[index].region })),
    histogram,
    audit: { drawsChecked, violations, minCount, electorate, rounding: "largest-remainder", synthetic: input.scenario === "synthetic", conditional: input.scenario === "conditional" },
  };
}

// Module workers have no document. Importing the kernel in Node never installs a handler.
if (typeof self !== "undefined" && typeof document === "undefined" && typeof self.postMessage === "function") {
  self.onmessage = (event) => {
    const { type, id, input } = event.data ?? {};
    if (type !== "simulate") return;
    try {
      const result = runSimulation(input, (progress) => self.postMessage({ type: "progress", id, progress }));
      self.postMessage({ type: "result", id, result });
    } catch (error) {
      self.postMessage({ type: "error", id, error: error instanceof Error ? error.message : String(error) });
    }
  };
}

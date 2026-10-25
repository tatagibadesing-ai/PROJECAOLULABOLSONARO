'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { gsap } from 'gsap';
import { Activity, ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Database, ExternalLink, FlaskConical, Globe2, Layers3, LockKeyhole, MapPin, Radio, RotateCcw, Search, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import BrazilMap from '../components/BrazilMap';
import ReplayPanel from '../components/ReplayPanel';
import LiveHistory from '../components/LiveHistory';
import TransferFlow from '../components/TransferFlow';
import BacktestPanel from '../components/BacktestPanel';
import ForecastAssumptions from '../components/ForecastAssumptions';
import ComparisonPanel from '../components/ComparisonPanel';
import MunicipalMap from '../components/MunicipalMap';
import { estimateLive } from '../lib/live-estimate';
import { formatName, makeSyntheticInput, stateInfo, type ConditionalForecast, type ModelSummary, type SimulationResult, type ModelFlow, type ModelInput } from '../lib/demo';

type Mode = 'projection' | 'live' | 'comparison';
type Bulletin = { electionId: string; round: number; generatedAt: string; sections: { total: number; counted: number; percent: number }; candidates: { id: string; name: string; votes: number; percent: number }[]; blank: number; null: number; abstention: number };
type StateBulletin = Omit<Bulletin, 'electionId' | 'round'> & { uf: string; fetchedAt: string; electorate: number; final?: boolean };
type ExtendedBulletin = Bulletin & { states?: StateBulletin[]; statesComplete?: boolean; statesReconciled?: boolean; final?: boolean };
type LiveResponse = { status: 'unconfigured' | 'waiting' | 'live' | 'stale' | 'error'; source: string; fetchedAt: string | null; attemptedAt: string | null; nextPollAt: string | null; message: string; data: ExtendedBulletin | null; stateIssues?: string[] };
type Territory = { id: string; uf: string; name: string; electorate: number; abstention: number; blank: number; null: number; valid: number; votes: Record<string, number>; notInstalledElectorate: number };
type OfficialData = { national: Territory; states: Territory[]; cities: Territory[]; generatedAt: string; validation: { domesticCityCount: number; foreignLocations: number; status: string } };
type PollsData = { status: string; asOf: string; scope: string; registrationStatus: string; average: { flavio: number; lula: number; count: number; label: string; method: string }; polls: { id: string; institute: string; sponsor: string; fieldStart: string; fieldEnd: string; sample: number; method: string; registration: string; denominator: string; candidates: { name: string; percent: number }[]; sourceUrl: string; includedInPartialAverage: boolean }[]; missing: string[] };
const number = new Intl.NumberFormat('pt-BR');
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (value?: number | null) => typeof value !== 'number' || !Number.isFinite(value) ? '—' : `${decimal.format(value * 100)}%`;
const interval = (side?: ModelSummary['flavio']) => side?.interval ? `${decimal.format(side.interval[0] * 100)}–${decimal.format(side.interval[1] * 100)}%` : side ? 'em cálculo' : 'aguardando validação';
const modes: { id: Mode; label: string; icon: typeof Activity }[] = [{ id: 'projection', label: 'Projeção', icon: Layers3 }, { id: 'live', label: 'Ao vivo', icon: Radio }, { id: 'comparison', label: 'Projeção × Resultado', icon: Activity }];

function SectionTitle({ index, title, right, children }: { index: string; title: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return <div className="section-heading"><div className="section-title"><span className="section-index">{index}</span><h2>{title}</h2>{children}</div>{right}</div>;
}

function Tag({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) { return <span className={`tag ${muted ? 'muted-tag' : ''}`}>{children}</span>; }

function Candidate({ id, summary, votes, live, synthetic }: { id: 'flavio' | 'lula'; summary?: ModelSummary; votes?: { votes: number; percent?: number }; live?: boolean; synthetic?: boolean }) {
  const side = summary?.[id];
  return <div className={`candidate ${id}`}>
    <div className="candidate-top"><span className="candidate-swatch" /><span>{id === 'flavio' ? 'Flávio Bolsonaro' : 'Lula'}</span><span className="party">{id === 'flavio' ? 'PL' : 'PT'}</span></div>
    <div className="candidate-value">{live ? votes?.percent !== undefined ? decimal.format(votes.percent) : '—' : side ? decimal.format(side.share * 100) : '—'}<span>%</span></div>
    <div className="candidate-caption">{live ? 'dos votos válidos apurados' : synthetic ? 'o cenário sintético projeta em votos válidos' : 'o modelo condicional projeta em votos válidos'}</div>
    <div className="candidate-details"><div><span>{live ? 'Votos apurados' : 'Intervalo de 80%'}</span><strong>{live ? votes ? number.format(votes.votes) : '—' : interval(side)}</strong></div><div><span>{live ? 'Fonte' : synthetic ? 'Chance no cenário' : 'Chance condicional¹'}</span><strong>{live ? 'TSE' : Number.isFinite(side?.winProbability) ? `${Math.round(side!.winProbability * 100)}%` : '—'}</strong></div></div>
  </div>;
}

function Needle({ summary, synthetic, live }: { summary?: ModelSummary; synthetic: boolean; live: boolean }) {
  const needle = useRef<SVGLineElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!needle.current) return;
    const angle = summary ? Math.max(-75, Math.min(75, (summary.flavio.share - .5) * -450)) : 0;
    const animation = gsap.to(needle.current, { rotation: angle, svgOrigin: '160 135', duration: reduced ? 0 : .7, ease: 'power2.out' });
    return () => { animation.kill(); };
  }, [summary, reduced]);
  return <div className="needle-panel"><div className="eyebrow">{live ? 'Estimativa do resultado final' : 'Margem nacional'}<CircleHelp size={13} /></div><svg viewBox="0 0 320 160" aria-label={summary ? synthetic ? 'Margem do cenário sintético' : 'Margem condicional às premissas' : 'Agulha indisponível, sem modelo validado'}>
    <path d="M45,135 A115,115 0 0 1 275,135" fill="none" className="gauge-track" strokeWidth="12" />
    <path d="M45,135 A115,115 0 0 1 160,20" fill="none" className="gauge-blue" strokeWidth="12" />
    <path d="M160,20 A115,115 0 0 1 275,135" fill="none" className="gauge-red" strokeWidth="12" />
    <line x1="160" y1="4" x2="160" y2="15" className="gauge-tick" />
    <text x="38" y="157" className="gauge-label">+20 pp</text><text x="160" y="158" textAnchor="middle" className="gauge-label">Empate</text><text x="282" y="157" textAnchor="end" className="gauge-label">+20 pp</text>
    {summary && <><line ref={needle} x1="160" y1="135" x2="160" y2="39" className="needle-line" /><circle cx="160" cy="135" r="5" className="needle-center" /></>}
    {!summary && <text x="160" y="110" textAnchor="middle" className="needle-empty">—</text>}
  </svg><p>{summary ? `${decimal.format(Math.abs(summary.flavio.share - summary.lula.share) * 100)} pp de margem · ${synthetic ? 'cenário sintético' : 'condicional'}` : 'Sem estimativa validada'}</p><span className="needle-note">{summary ? `Intervalo de 80%: ${interval(summary.flavio)}` : 'Aguardando dados oficiais e calibração'}</span></div>;
}

export default function Dashboard() {
  const [mode, setMode] = useState<Mode>('projection');
  const [lab, setLab] = useState(false);
  const [replayBlocked, setReplayBlocked] = useState(false);
  const [selected, setSelected] = useState('SP');
  const [search, setSearch] = useState('');
  const [layer, setLayer] = useState('Projeção');
  const [official, setOfficial] = useState<OfficialData | null>(null);
  const [polls, setPolls] = useState<PollsData | null>(null);
  const [city, setCity] = useState('');
  const [transfer, setTransfer] = useState(55);
  const [abstention, setAbstention] = useState(22);
  const [uncertainty, setUncertainty] = useState(.1);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [forecast, setForecast] = useState<ConditionalForecast | null>(null);
  const [forecastError, setForecastError] = useState('');
  const [draft, setDraft] = useState(false);
  const [draftInput, setDraftInput] = useState<ModelInput | null>(null);
  const [preview, setPreview] = useState<SimulationResult | null>(null);
  const [abstentionDelta, setAbstentionDelta] = useState(0);
  const [biasCorrection, setBiasCorrection] = useState(0);
  const [groupShares, setGroupShares] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState(0);
  const [frozen, setFrozen] = useState<{ frozen: boolean; reason?: string; generatedAt?: string; sha256?: string; projection?: ConditionalForecast; validation?: { publicationReady: boolean; pendingAnchors: number[] } } | null>(null);
  const [showCities, setShowCities] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [workerError, setWorkerError] = useState('');
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [cityLive, setCityLive] = useState<(LiveResponse & { municipality?: { id: string; name: string } }) | null>(null);
  const [tick, setTick] = useState(Date.now());
  const [expandedMethod, setExpandedMethod] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const switchedLive = useRef(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setLab(params.get('ensaio') === 'demonstracao'); if (params.get('ensaio') === 'demonstracao') setLayer('Projeção');
    setReplayBlocked(params.get('ensaio') === '1turno');
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => { fetch('/data/first-round-2026.json').then(r => r.ok ? r.json() : null).then(setOfficial).catch(() => {}); }, []);
  useEffect(() => { fetch('/data/polls.json').then(r => r.ok ? r.json() : null).then(setPolls).catch(() => {}); }, []);
  useEffect(() => { fetch('/data/projection-conditional.json').then(r => { if (!r.ok) throw new Error('A projeção condicional ainda está sendo preparada.'); return r.json(); }).then((data: ConditionalForecast) => { setForecast(data); if (data.controlDefaults) setTransfer(data.controlDefaults.otherTransferPct ?? 55); }).catch(e => setForecastError(e.message)); }, []);
  useEffect(() => { fetch('/api/projecao').then(r => r.ok ? r.json() : null).then(setFrozen).catch(() => {}); }, []);

  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch('/api/apuracao', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: LiveResponse = await response.json();
        if (!stopped) { setLive(data); if (data.data && data.data.sections.counted > 0 && !switchedLive.current) { setMode('live'); setLayer('Apuração'); switchedLive.current = true; } }
      } catch (e) {
        if (!stopped) setLive(previous => ({ ...(previous ?? { source: 'TSE', fetchedAt: null, attemptedAt: null, nextPollAt: null, data: null }), status: previous?.data ? 'stale' : 'error', message: 'Não foi possível consultar a rota de apuração. O último boletim válido foi preservado.' }));
      }
    };
    void poll();
    const timer = setInterval(poll, 30000);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!lab && (!draft || !forecast?.input)) return;
    const worker = new Worker('/model-worker.js', { type: 'module' });
    let stopped = false;
    workerRef.current = worker;
    requestRef.current += 1;
    const id = requestRef.current;
    setCalculating(true); setResult(null); setProgress(0); setWorkerError('');
    worker.onerror = () => { if (!stopped) { setWorkerError('O motor de simulação não pôde ser iniciado.'); setCalculating(false); } };
    worker.onmessage = e => {
      if (stopped || e.data.id !== id) return;
      if (e.data.type === 'progress') setProgress(e.data.progress);
      if (e.data.type === 'result') { setResult(e.data.result); setCalculating(false); setProgress(1); setWorkerError(''); }
      if (e.data.type === 'error') { setWorkerError(e.data.error ?? e.data.message ?? 'Falha no motor de simulação.'); setCalculating(false); }
    };
    const timer = setTimeout(async () => {
      try {
        const input = lab ? makeSyntheticInput(transfer, abstention, uncertainty) : (await import('../lib/forecast')).applyScenarioControls(forecast!.input!, forecast!.controlDefaults!, { otherTransferPct: transfer, abstentionDeltaPp: abstentionDelta, biasCorrection, groupShares });
        if (!stopped) {
          if (!lab) {
            setDraftInput(input as ModelInput);
            const { expectedProjection, expectedCounts } = await import('../lib/forecast');
            const deterministic = expectedProjection((input as ModelInput).cities);
            const summary = (id: string, counts: ModelSummary['counts'], state?: string, electorate?: number): ModelSummary => {
              const valid = counts.flavio + counts.lula;
              return { id, state, electorate, counts, flavio: { share: valid > 0 ? counts.flavio / valid : NaN, interval: null as unknown as [number, number], winProbability: NaN }, lula: { share: valid > 0 ? counts.lula / valid : NaN, interval: null as unknown as [number, number], winProbability: NaN } };
            };
            setPreview({ scenario: 'conditional', label: 'Rascunho determinístico · intervalos em cálculo', simulations: 20000, national: summary('BR', deterministic.national.counts as ModelSummary['counts']), states: deterministic.states.map(s => summary(s.id, s.counts as ModelSummary['counts'])), cities: (input as ModelInput).cities.map(c => { const row = expectedCounts(c.groups); return summary(c.id, { flavio: row[0], lula: row[1], blank: row[2], null: row[3], abstention: row[4] }, c.state, c.electorate); }), histogram: [], audit: { drawsChecked: 0, violations: 0 } });
          }
          if (!stopped) worker.postMessage({ type: 'simulate', id, input });
        }
      } catch (e) { if (!stopped) { setWorkerError(e instanceof Error ? e.message : 'Não foi possível preparar as premissas.'); setCalculating(false); } }
    }, 300);
    return () => { stopped = true; clearTimeout(timer); worker.terminate(); workerRef.current = null; };
  }, [lab, draft, forecast, transfer, abstention, uncertainty, abstentionDelta, biasCorrection, groupShares]);

  const toggleLab = useCallback((enabled: boolean) => {
    setLab(enabled); setReplayBlocked(false); setMode('projection'); setLayer('Projeção'); setDraft(false); setPreview(null); setResult(null); setCalculating(false); setTransfer(enabled ? 55 : forecast?.controlDefaults?.otherTransferPct ?? 55); setAbstentionDelta(0); setBiasCorrection(0); setGroupShares({});
    const url = new URL(window.location.href);
    if (enabled) url.searchParams.set('ensaio', 'demonstracao'); else url.searchParams.delete('ensaio');
    window.history.replaceState({}, '', url.toString());
  }, [forecast]);

  const comparisonBase = frozen?.frozen && frozen.projection ? frozen.projection : forecast;
  const activeForecast = mode === 'comparison' ? comparisonBase : lab ? result : draft ? calculating && preview ? preview : result?.scenario === 'conditional' ? result : preview ?? forecast : forecast;
  const summary = mode !== 'live' ? activeForecast?.national : undefined;
  const isLive = mode === 'live';
  const selectedState = stateInfo.find(x => x[0] === selected)!;
  const stateSummary = mode === 'projection' && layer === 'Projeção' ? activeForecast?.states.find(x => x.id === selected) : undefined;
  const states = [...stateInfo].filter(([uf, name]) => `${uf} ${name}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).sort((a, b) => official ? (official.states.find(x => x.id === b[0])?.electorate ?? 0) - (official.states.find(x => x.id === a[0])?.electorate ?? 0) : a[1].localeCompare(b[1], 'pt-BR'));
  const age = live?.data?.generatedAt ? Math.max(0, Math.floor((tick - new Date(live.data.generatedAt).getTime()) / 1000)) : null;
  const ageLabel = age === null ? 'Sem boletim recebido' : age < 60 ? `há ${age}s` : `há ${Math.floor(age / 60)}min ${age % 60}s`;
  const maxBin = activeForecast ? Math.max(...activeForecast.histogram.map(x => x.count)) : 1;
  const actualVotes = (id: string) => { const candidate = live?.data?.candidates.find(x => x.id === id); return candidate ? { ...candidate, percent: live?.data?.candidates.some(c => c.votes > 0) ? candidate.percent : undefined } : undefined; };
  const baseline = !lab && layer === '1º turno' && mode === 'projection';
  const selectedOfficial = baseline ? official?.states.find(x => x.id === selected) : undefined;
  const selectedLive = isLive ? live?.data?.states?.find(x => x.uf === selected) : undefined;
  const liveMap = isLive && layer === 'Apuração' ? live?.data?.states?.filter(x => x.candidates.some(c => c.votes > 0)).map(x => ({ id: x.uf, valid: x.candidates.reduce((sum, c) => sum + c.votes, 0), votes: { '22': x.candidates.find(c => c.id === 'flavio')?.votes ?? 0, '13': x.candidates.find(c => c.id === 'lula')?.votes ?? 0 } })) : undefined;
  const cities = official?.cities.filter(x => x.uf === selected) ?? [];
  const selectedCity = cities.find(x => x.id === city) ?? cities[0];
  const selectedCityForecast = activeForecast?.cities.find(x => x.id === selectedCity?.id);
  const municipalResults = useMemo(() => Object.fromEntries((activeForecast?.cities ?? []).filter(x => Number.isFinite(x.flavio.share)).map(x => [x.id!, { share: x.flavio.share, low: x.flavio.interval?.[0], high: x.flavio.interval?.[1] }])), [activeForecast]);
  const nowcast = useMemo(() => {
    if (!comparisonBase || !live?.data?.statesComplete) return null;
    try {
      return estimateLive({ granularity: 'state', units: comparisonBase.states.map(state => {
        const bulletin = live.data!.states!.find(s => s.uf === state.id)!;
        return { id: state.id!, uf: state.id!, projectedValidVotes: state.counts.flavio + state.counts.lula, projectedFlavioShare: state.flavio.share, interval80: state.flavio.interval, countedFlavio: bulletin.candidates.find(c => c.id === 'flavio')!.votes, countedLula: bulletin.candidates.find(c => c.id === 'lula')!.votes, final: bulletin.final === true };
      }) });
    } catch { return null; }
  }, [comparisonBase, live?.data]);
  const nowcastSummary: ModelSummary | undefined = nowcast?.national?.flavioShare != null && nowcast.national.interval80 ? {
    flavio: { share: nowcast.national.flavioShare, interval: nowcast.national.interval80, winProbability: .5 },
    lula: { share: 1 - nowcast.national.flavioShare, interval: [1 - nowcast.national.interval80[1], 1 - nowcast.national.interval80[0]], winProbability: .5 },
    counts: { flavio: nowcast.national.flavioVotes, lula: nowcast.national.lulaVotes, blank: 0, null: 0, abstention: 0 },
  } : undefined;
  const flows = useMemo(() => {
    const input = lab ? makeSyntheticInput(transfer, abstention, uncertainty) : draft ? draftInput : null;
    if (!input) return forecast?.flows ?? [];
    const rows = new Map<string, ModelFlow>();
    for (const city of input.cities) for (const group of city.groups) {
      const meta = group as { name?: string; role?: string; origin?: string };
      const row = rows.get(group.id) ?? { source: group.id, name: meta.name, role: meta.role, origin: meta.origin, count: 0, destinations: { flavio: 0, lula: 0, blank: 0, null: 0, abstention: 0 } };
      row.count += group.count;
      (['flavio', 'lula', 'blank', 'null', 'abstention'] as const).forEach((d, i) => { row.destinations[d] += group.count * group.transfer[i]; });
      rows.set(group.id, row);
    }
    return [...rows.values()];
  }, [lab, forecast, draft, draftInput, transfer, abstention, uncertainty]);
  const differences = useMemo(() => Object.fromEntries((live?.data?.states ?? []).filter(s => s.final && s.candidates.some(c => c.votes > 0)).flatMap(s => { const projected = comparisonBase?.states.find(f => f.id === s.uf); return projected ? [[s.uf, (s.candidates.find(c => c.id === 'flavio')?.percent ?? 0) / 100 - projected.flavio.share]] : []; })), [comparisonBase, live?.data]);
  const resetScenario = () => { setDraft(false); setDraftInput(null); setPreview(null); setResult(null); setTransfer(lab ? 55 : forecast?.controlDefaults?.otherTransferPct ?? 55); setAbstention(22); setUncertainty(.1); setAbstentionDelta(0); setBiasCorrection(0); setGroupShares({}); setWorkerError(''); };
  const downloadScenario = () => { if (!activeForecast) return; const blob = new Blob([JSON.stringify({ ...activeForecast, frozen: false, publicationReady: false, downloadedAt: new Date().toISOString(), note: 'Cenário condicional às premissas; não é uma projeção eleitoral validada ou congelada.' }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = lab ? 'laboratorio-sintetico.json' : draft ? 'cenario-condicional-rascunho.json' : 'projecao-condicional.json'; a.click(); URL.revokeObjectURL(url); };
  const cityBulletin = cityLive?.municipality?.id === selectedCity?.id ? cityLive?.data : null;
  const cityNowcast = useMemo(() => {
    const projected = comparisonBase?.cities.find(c => c.id === selectedCity?.id);
    if (!projected || !cityBulletin || !Number.isFinite(projected.flavio.share) || !projected.flavio.interval) return null;
    try { return estimateLive({ granularity: 'municipal', units: [{ id: projected.id!, uf: selected, projectedValidVotes: projected.counts.flavio + projected.counts.lula, projectedFlavioShare: projected.flavio.share, interval80: projected.flavio.interval, countedFlavio: cityBulletin.candidates.find(c => c.id === 'flavio')!.votes, countedLula: cityBulletin.candidates.find(c => c.id === 'lula')!.votes, final: cityBulletin.final === true }] }); } catch { return null; }
  }, [comparisonBase, selectedCity?.id, selected, cityBulletin]);
  useEffect(() => {
    if (mode === 'projection' || !selectedCity || lab) return;
    const controller = new AbortController();
    let stopped = false;
    const poll = async () => {
      try {
        const query = new URLSearchParams({ uf: selectedCity.uf, municipio: selectedCity.id.slice(3) });
        const response = await fetch(`/api/apuracao?${query}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Consulta municipal indisponível.');
        const data = await response.json();
        if (!stopped) setCityLive(data);
      } catch { if (!stopped) setCityLive(previous => previous?.municipality?.id === selectedCity.id ? { ...previous, status: previous.data ? 'stale' : 'error', message: 'Falha na atualização municipal. Último boletim recebido preservado.' } : null); }
    };
    void poll(); const timer = setInterval(poll, 30000);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, [mode, selectedCity?.id, lab]);

  return <main>
    <div className="disclaimer"><ShieldCheck size={13} /><p>Projeção estatística feita a partir do resultado oficial do 1º turno e de pesquisas registradas no TSE. Não é pesquisa eleitoral nem resultado oficial. Resultado oficial: <a href="https://resultados.tse.jus.br" target="_blank" rel="noreferrer">TSE <ArrowUpRight size={11} /></a></p></div>
    <header className="topbar"><a className="brand" href="/" aria-label="Observatório, início"><span className="brand-mark"><i /><i /><i /><i /></span><span>Observatório<span className="brand-sub">Presidencial 2026</span></span></a><nav className="mode-tabs" aria-label="Modo do painel">{modes.map(({ id, label, icon: Icon }) => <button key={id} className={mode === id ? 'active' : ''} onClick={() => { if (id !== 'projection' && lab) toggleLab(false); setMode(id); if (id === 'live') setLayer('Apuração'); else if (id === 'projection') setLayer('Projeção'); }}><Icon size={14} /><span>{label}</span>{id === 'live' && <span className={`tiny-dot ${live?.status === 'live' ? 'on' : ''}`} />}</button>)}</nav><div className="header-meta"><span className="header-date">25 outubro · 2º turno*</span><a href="/documentos/metodo">Método <ArrowUpRight size={12} /></a></div></header>

    <div className="workspace">
      <div className="page-heading"><div><div className="breadcrumb">Brasil <ChevronRight size={12} /> Eleições presidenciais <ChevronRight size={12} /> 2º turno</div><h1>{mode === 'projection' ? 'Cada voto, em perspectiva.' : mode === 'live' ? 'Acompanhe a apuração.' : 'O modelo diante dos votos.'}</h1><p>{mode === 'projection' ? 'Projeção, incerteza e dados oficiais. Tudo no mesmo lugar.' : mode === 'live' ? 'Boletins oficiais do TSE, com a hora de cada atualização.' : 'A mesma projeção congelada, do primeiro ao último boletim.'}</p></div><div className="page-actions"><span className="data-status"><span className={`status-dot ${live?.status === 'live' ? 'green' : ''}`} />{live?.status === 'stale' ? 'Boletim desatualizado' : live?.status === 'live' ? 'TSE conectado' : official ? '1º turno verificado' : 'Validação pendente'}</span><a className="button docs-button" href="/documentos/metodo"><Database size={13} />Documentação</a><button className={`button ${lab ? 'lab-active' : ''}`} onClick={() => toggleLab(!lab)}><FlaskConical size={14} />{lab ? 'Sair do laboratório' : 'Abrir laboratório'}</button></div></div>

      <AnimatePresence mode="wait"><motion.div key={lab ? 'lab' : replayBlocked ? 'blocked' : 'status'} initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .18 }} className={`integrity-banner ${lab ? 'synthetic-banner' : ''}`}><div className="integrity-icon">{lab ? <FlaskConical size={17} /> : <LockKeyhole size={17} />}</div><div><strong>{lab ? 'Laboratório sintético · sem valor eleitoral' : replayBlocked ? 'Ensaio com o 1º turno · dados reais, ordem simulada' : forecast ? draft ? 'Rascunho condicional · premissas alteradas' : 'Projeção condicional · probabilidades ainda não validadas' : forecastError ? forecastError : 'Preparando o cenário condicional com dados oficiais'}</strong><p>{lab ? 'Dados inventados para testar o motor e os controles. Estes números não são uma previsão de 2026.' : replayBlocked ? 'A reprodução abaixo exercita o fluxo dos dados municipais oficiais em várias ordens. Não valida a estimativa final nem a cobertura estatística.' : forecast ? 'Base municipal oficial + pesquisas parciais + hipóteses explícitas. As chances e os intervalos dependem dessas premissas; a cobertura de 80% não foi validada. Não é pesquisa eleitoral nem resultado oficial.' : 'Carregando a base verificada, as transferências e as 20.000 simulações. Os dados oficiais do primeiro turno ficam separados abaixo.'}</p></div>{lab ? <button className="icon-button" onClick={() => toggleLab(false)} aria-label="Fechar laboratório"><X size={17} /></button> : <a href="/documentos/fontes">Ver fontes <ArrowUpRight size={14} /></a>}</motion.div></AnimatePresence>

      {replayBlocked && <ReplayPanel />}

      {official && !lab && <section className="baseline-panel" aria-label="Resultado oficial do primeiro turno"><div className="baseline-label"><ShieldCheck size={17} /><div><strong>1º turno · oficial TSE</strong><span>100% totalizado · base verificada</span></div></div><div className="baseline-values"><div><span>Flávio Bolsonaro</span><strong className="blue-text">{pct(official.national.votes['22'] / official.national.valid)}</strong><small>{number.format(official.national.votes['22'])} votos</small></div><div><span>Lula</span><strong className="red-text">{pct(official.national.votes['13'] / official.national.valid)}</strong><small>{number.format(official.national.votes['13'])} votos</small></div><div><span>Votos válidos</span><strong>{number.format(official.national.valid)}</strong><small>{number.format(official.validation.domesticCityCount)} municípios brasileiros</small></div></div><a href="/documentos/fontes">Conferir base <ArrowUpRight size={12} /></a></section>}

      <section className="national-section panel" aria-labelledby="national-heading"><div className="panel-top"><div className="section-title"><span className="section-index">01</span><h2 id="national-heading">{isLive ? 'Apuração nacional' : mode === 'comparison' ? 'Projeção × resultado nacional' : 'O cenário nacional'}</h2><Tag muted={!lab}>{lab && !isLive ? 'Sintético' : isLive ? 'Fonte oficial · TSE' : draft ? 'Rascunho condicional' : 'Condicional · não validado'}</Tag></div><div className="panel-top-meta"><span>{isLive ? ageLabel : calculating ? `Calculando ${Math.round(progress * 100)}%` : activeForecast ? '20.000 simulações' : 'Preparando projeção'}</span>{isLive ? <Radio size={13} /> : <LockKeyhole size={13} />}</div></div>
        <div className="national-grid"><div className="national-result"><div className="candidates"><Candidate id="flavio" synthetic={lab} summary={summary} live={isLive} votes={actualVotes('flavio')} /><div className="candidate-divider"><span>×</span></div><Candidate id="lula" synthetic={lab} summary={summary} live={isLive} votes={actualVotes('lula')} /></div><div className="vote-bar" aria-label={summary ? 'Divisão dos votos válidos no cenário sintético' : 'Votos válidos indisponíveis'}><div className={`vote-bar-blue ${summary ? '' : 'empty'}`} style={{ width: summary ? `${summary.flavio.share * 100}%` : '50%' }} /><div className={`vote-bar-red ${summary ? '' : 'empty'}`} style={{ width: summary ? `${summary.lula.share * 100}%` : '50%' }} />{summary?.flavio.interval && <span className="bar-interval" style={{ left: `${summary.flavio.interval[0] * 100}%`, width: `${(summary.flavio.interval[1] - summary.flavio.interval[0]) * 100}%` }} />}</div><div className="bar-meta"><span>{isLive ? 'Apurado até agora' : 'Votos válidos · intervalo central de 80%'}</span><span className="bar-half">50%</span><span>{lab && !isLive ? 'Cenário sintético' : isLive ? 'Resultado apurado' : 'Condicional às premissas'}</span></div><div className="turnout-row">{(['abstention', 'blank', 'null'] as const).map((key, i) => <div key={key}><span>{['Abstenção', 'Brancos', 'Nulos'][i]}</span><strong>{summary ? `≈ ${number.format(Math.round(summary.counts[key] / 1000) * 1000)}` : isLive && live?.data ? number.format(live.data[key]) : '—'}</strong><small>{summary?.countsInterval ? `${number.format(Math.round(summary.countsInterval[key][0] / 1000) * 1000)}–${number.format(Math.round(summary.countsInterval[key][1] / 1000) * 1000)} · IC80%` : lab && !isLive ? 'média sintética · sem IC' : isLive ? 'registro oficial' : 'aguardando base'}</small></div>)}</div></div><Needle summary={isLive ? nowcastSummary : summary} synthetic={lab} live={isLive} /></div>
        {isLive && <div className="live-progress-row"><div><span>Seções totalizadas</span><strong>{live?.data ? `${decimal.format(live.data.sections.percent)}%` : '—'}</strong></div><div className="live-progress-track"><span style={{ width: `${live?.data?.sections.percent ?? 0}%` }} /></div><span>{live?.data ? `${number.format(live.data.sections.counted)} de ${number.format(live.data.sections.total)}` : 'Aguardando boletim'}</span></div>}
        {isLive && <p className="live-explanation">{nowcast?.national ? `Agulha condicional por UF${live?.data?.statesReconciled ? '' : ' (UFs com horários diferentes; soma pode divergir do boletim nacional)'}: soma contagens oficiais a votos restantes estimados pelo modelo. Não usa porcentagem de seções como fração de votos. Intervalo de referência de 80%, sem cobertura validada.` : nowcast?.warnings.at(-1) ?? 'A agulha condicional aguarda boletins válidos e recentes das 28 circunscrições. Contagens oficiais permanecem disponíveis; nenhum voto restante é mostrado como apurado.'}</p>}
        {mode === 'comparison' && <div className="comparison-notice"><LockKeyhole size={16} /><span>{frozen?.frozen ? `Cenário condicional congelado em ${new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(frozen.generatedAt!))} BRT. Congelamento registra a previsão; não valida probabilidades ou cobertura.` : 'Sem arquivo congelado: os valores acima são um cenário condicional exploratório. Só resultados oficiais finais geram erros de comparação.'}</span></div>}
      </section>

      <div className="scenario-audit-row"><span>¹ Chances condicionais às hipóteses · cobertura de 80% não validada.</span><div><button className="text-button" disabled={!activeForecast || calculating} onClick={downloadScenario}><ArrowDown size={12} />{draft ? 'Baixar rascunho' : 'Baixar cenário condicional'}</button>{frozen?.frozen ? <a className="text-button" href="/api/projecao?download=1"><LockKeyhole size={12} />Cenário congelado · não validado</a> : <button className="text-button" disabled title={frozen?.reason ?? 'Conferindo o arquivo e o prazo de congelamento'}><LockKeyhole size={12} />{frozen ? 'Congelamento bloqueado' : 'Conferindo congelamento'}</button>}</div></div>

      <div className="main-grid"><section className="map-panel panel"><SectionTitle index="02" title="O Brasil, estado por estado" right={<span className="section-sub">27 UFs + exterior</span>} /><div className="map-toolbar"><div className="segmented small" aria-label="Camada do mapa">{['1º turno', 'Projeção', 'Apuração', 'Diferença'].map(item => <button className={layer === item ? 'active' : ''} onClick={() => setLayer(item)} key={item}>{item}</button>)}</div><button className="map-select" onClick={() => document.getElementById('state-search')?.focus()}><MapPin size={13} />{selectedState[1]}<ChevronDown size={13} /></button></div><div className="map-stage"><div className="map-caption"><span>{baseline ? 'Margem · 1º turno oficial' : layer === 'Projeção' && lab ? 'Margem · cenário sintético' : layer === 'Projeção' ? 'Projeção condicional às premissas' : layer === 'Apuração' ? 'Apuração oficial' : 'Erro do modelo'}</span><strong>{isLive && liveMap?.length ? 'Votos apurados · TSE' : baseline && official ? '04 outubro 2026 · TSE' : layer === 'Projeção' && activeForecast ? '20.000 simulações' : layer === 'Diferença' ? 'Resultado final − cenário condicional' : 'Dados indisponíveis'}</strong></div><BrazilMap selected={selected} onSelect={uf => { setSelected(uf); setShowCities(uf !== 'ZZ'); setCity(''); }} results={activeForecast?.states} synthetic={lab && mode === 'projection' && layer === 'Projeção'} conditional={!lab && layer === 'Projeção'} differences={layer === 'Diferença' ? differences : undefined} official={baseline ? official?.states : liveMap} officialLabel={isLive ? '2º turno · apuração oficial' : '1º turno oficial'} /><div className="map-legend"><span className="blue-text">Flávio</span><div className="legend-scale"><i /><i /><i /><i /><i /><i /><i /></div><span className="red-text">Lula</span><small>{layer === 'Projeção' ? 'Intensidade = chance condicional · cobertura não validada' : layer === 'Diferença' ? 'Somente UFs com totalização final' : 'Maior intensidade = maior margem'}</small></div></div><div className="selected-detail"><div><span className="state-code">{selected === 'ZZ' ? <Globe2 size={17} /> : selected}</span><div><strong>{selectedState[1]}</strong><span>{selectedState[2]}{isLive ? ` · apuração oficial${selectedLive ? ` · ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(selectedLive.generatedAt))} BRT${live?.stateIssues?.includes(selected) || tick - Date.parse(selectedLive.generatedAt) > 90000 ? ' · desatualizado' : ''}` : ' · sem boletim'}` : lab ? ' · sintético' : baseline ? ' · 1º turno oficial' : ' · projeção condicional'}</span></div></div><div className="selected-values"><span className="blue-text">{selectedLive ? selectedLive.candidates.some(c => c.votes > 0) ? `${decimal.format(selectedLive.candidates.find(c => c.id === 'flavio')?.percent ?? 0)}%` : '—' : selectedOfficial ? pct(selectedOfficial.votes['22'] / selectedOfficial.valid) : pct(stateSummary?.flavio.share)}</span><span className="selected-vs">×</span><span className="red-text">{selectedLive ? selectedLive.candidates.some(c => c.votes > 0) ? `${decimal.format(selectedLive.candidates.find(c => c.id === 'lula')?.percent ?? 0)}%` : '—' : selectedOfficial ? pct(selectedOfficial.votes['13'] / selectedOfficial.valid) : pct(stateSummary?.lula.share)}</span></div><div className="selected-interval"><span>{isLive ? 'Seções totalizadas' : baseline ? 'Votos válidos · oficial' : 'Intervalos de 80%'}</span><strong>{selectedLive ? `${decimal.format(selectedLive.sections.percent)}%` : selectedOfficial ? number.format(selectedOfficial.valid) : <>Flávio {interval(stateSummary?.flavio)}<br />Lula {interval(stateSummary?.lula)}</>}</strong></div></div>{selectedCity && <div className="municipal-list"><div className="municipal-list-title"><span>{number.format(cities.length)} localidades · {baseline ? '1º turno oficial' : 'projeção condicional'}</span><select aria-label="Selecionar município" value={selectedCity.id} onChange={e => setCity(e.target.value)}>{cities.map(c => <option value={c.id} key={c.id}>{formatName(c.name)}</option>)}</select></div><div className="city-comparison"><div><h3>1º turno · oficial</h3><div className="municipal-values"><span>Flávio<strong className="blue-text">{selectedCity.valid > 0 ? `${Math.round(selectedCity.votes['22'] / selectedCity.valid * 100)}%` : '—'}</strong></span><span>Lula<strong className="red-text">{selectedCity.valid > 0 ? `${Math.round(selectedCity.votes['13'] / selectedCity.valid * 100)}%` : '—'}</strong></span></div><p>{number.format(selectedCity.electorate)} eleitores · {number.format(selectedCity.valid)} válidos</p></div><div><h3>{lab ? 'Cenário sintético' : '2º turno · condicional'}</h3><div className="municipal-values"><span>Flávio<strong className="blue-text">{Number.isFinite(selectedCityForecast?.flavio.share) ? `${Math.round(selectedCityForecast!.flavio.share * 100)}%` : '—'}</strong></span><span>Lula<strong className="red-text">{Number.isFinite(selectedCityForecast?.lula.share) ? `${Math.round(selectedCityForecast!.lula.share * 100)}%` : '—'}</strong></span></div><p>{selectedCityForecast?.flavio.interval ? <>IC80% · Flávio {Math.round(selectedCityForecast.flavio.interval[0] * 100)}–{Math.round(selectedCityForecast.flavio.interval[1] * 100)}% · Lula {Math.round(selectedCityForecast.lula.interval[0] * 100)}–{Math.round(selectedCityForecast.lula.interval[1] * 100)}%</> : 'Aguardando cálculo municipal'}</p></div></div>{selectedCityForecast && <details className="city-votes"><summary>Votos, brancos, nulos e abstenção</summary><table><thead><tr><th>Destino</th><th>1º turno oficial</th><th>2º turno condicional</th><th>Intervalo80%</th></tr></thead><tbody>{([{ key: 'flavio', label: 'Flávio', before: selectedCity.votes['22'] }, { key: 'lula', label: 'Lula', before: selectedCity.votes['13'] }, { key: 'blank', label: 'Brancos', before: selectedCity.blank }, { key: 'null', label: 'Nulos', before: selectedCity.null }, { key: 'abstention', label: 'Abstenção', before: selectedCity.abstention }] as const).map(d => <tr key={d.key}><td>{d.label}</td><td>{number.format(d.before)}</td><td>≈{number.format(Math.round(selectedCityForecast.counts[d.key]))}</td><td>{selectedCityForecast.countsInterval ? `${number.format(Math.round(selectedCityForecast.countsInterval[d.key][0]))}–${number.format(Math.round(selectedCityForecast.countsInterval[d.key][1]))}` : '—'}</td></tr>)}</tbody></table></details>}{mode !== 'projection' && <div className="city-official"><h3>2º turno · apuração oficial TSE</h3><div className="municipal-values"><span>Flávio<strong className="blue-text">{cityBulletin ? number.format(cityBulletin.candidates.find(c => c.id === 'flavio')?.votes ?? 0) : '—'}</strong></span><span>Lula<strong className="red-text">{cityBulletin ? number.format(cityBulletin.candidates.find(c => c.id === 'lula')?.votes ?? 0) : '—'}</strong></span><span>Seções<strong>{cityBulletin ? `${decimal.format(cityBulletin.sections.percent)}%` : '—'}</strong></span></div><p>{cityBulletin ? `Boletim ${new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(cityBulletin.generatedAt))} BRT${cityLive?.status === 'stale' ? ' · desatualizado' : ''}` : 'Consultando o arquivo municipal oficial…'}</p>{cityNowcast?.national?.flavioShare != null && cityNowcast.national.interval80 ? <p className="city-nowcast">Estimativa final condicional: Flávio {Math.round(cityNowcast.national.flavioShare * 100)}% (IC80% {Math.round(cityNowcast.national.interval80[0] * 100)}–{Math.round(cityNowcast.national.interval80[1] * 100)}%); Lula {Math.round((1 - cityNowcast.national.flavioShare) * 100)}% (IC80% {Math.round((1 - cityNowcast.national.interval80[1]) * 100)}–{Math.round((1 - cityNowcast.national.interval80[0]) * 100)}%). Cobertura não validada.</p> : <p>{cityNowcast?.warnings.at(-1) ?? cityLive?.message}</p>}{mode === 'comparison' && cityBulletin?.final && selectedCityForecast && cityBulletin.candidates.some(c => c.votes > 0) && <p>Erro final ante o cenário condicional: {Math.round((cityBulletin.candidates.find(c => c.id === 'flavio')!.percent / 100 - selectedCityForecast.flavio.share) * 100)} pp para Flávio; sinal oposto para Lula. {frozen?.frozen ? 'Base congelada.' : 'Comparação exploratória, sem base congelada.'}</p>}</div>}</div>}<div className="municipal-map-actions"><button className="text-button" disabled={selected === 'ZZ'} onClick={() => { setShowCities(!showCities); if (layer === '1º turno') setLayer('Projeção'); }}>{showCities ? 'Ocultar mapa municipal' : 'Explorar mapa municipal'}<ChevronDown size={13} /></button><span>Canvas · limites IBGE · códigos oficiais TSE</span></div>{showCities && !lab && <MunicipalMap uf={selected} selectedCityId={selectedCity?.id} onSelectCity={setCity} cityResults={calculating && draft ? undefined : municipalResults} label={calculating && draft ? 'Rascunho condicional · intervalos em cálculo' : 'Projeção condicional às premissas'} />}<div className="municipal-notice"><CircleHelp size={13} /><span>{lab ? 'O laboratório usa localidades inventadas. Os municípios oficiais acima ficam sem projeção sintética.' : 'Intervalos e chances são condicionais às premissas. A cobertura municipal de 80% ainda não foi validada.'}</span></div></section>

        <section className="states-panel panel"><SectionTitle index="03" title="Por estado" right={<Tag muted>{official ? 'Por eleitorado' : 'Ordem alfabética'}</Tag>} /><div className="table-controls"><Search size={14} /><input id="state-search" aria-label="Buscar estado" placeholder="Buscar estado ou UF" value={search} onChange={e => setSearch(e.target.value)} /><span>{states.length}</span></div><div className="state-table-wrap"><table className="state-table"><thead><tr><th>Estado</th><th className="blue-text">Flávio</th><th className="red-text">Lula</th><th>{isLive ? 'Seções' : baseline ? 'Eleitorado' : 'IC 80%¹'}</th></tr></thead><tbody>{states.map(([uf, name]) => { const s = activeForecast?.states.find(x => x.id === uf); const real = baseline ? official?.states.find(x => x.id === uf) : undefined; const ap = isLive ? live?.data?.states?.find(x => x.uf === uf) : undefined; return <tr key={uf} className={selected === uf ? 'selected-row' : ''} onClick={() => setSelected(uf)}><td><button onClick={() => setSelected(uf)}><span className="table-uf">{uf === 'ZZ' ? <Globe2 size={12} /> : uf}</span>{name}</button></td><td title={ap ? `Boletim de ${new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(ap.generatedAt))} BRT${live?.stateIssues?.includes(uf) ? ' · desatualizado' : ''}` : undefined}>{ap ? ap.candidates.some(c => c.votes > 0) ? `${decimal.format(ap.candidates.find(c => c.id === 'flavio')?.percent ?? 0)}%` : '—' : real ? pct(real.votes['22'] / real.valid) : pct(s?.flavio.share)}{!isLive && !baseline && s && <small className="state-win-chance">{Number.isFinite(s.flavio.winProbability) ? `chance ${Math.round(s.flavio.winProbability * 100)}%` : 'chance em cálculo'}</small>}</td><td title={ap ? `Boletim de ${new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(ap.generatedAt))} BRT${live?.stateIssues?.includes(uf) ? ' · desatualizado' : ''}` : undefined}>{ap ? ap.candidates.some(c => c.votes > 0) ? `${decimal.format(ap.candidates.find(c => c.id === 'lula')?.percent ?? 0)}%` : '—' : real ? pct(real.votes['13'] / real.valid) : pct(s?.lula.share)}{!isLive && !baseline && s && <small className="state-win-chance">{Number.isFinite(s.lula.winProbability) ? `chance ${Math.round(s.lula.winProbability * 100)}%` : 'chance em cálculo'}</small>}</td><td>{ap ? `${decimal.format(ap.sections.percent)}%` : real ? number.format(real.electorate) : s?.flavio.interval ? `${Math.round(s.flavio.interval[0] * 100)}–${Math.round(s.flavio.interval[1] * 100)}` : s ? 'em cálculo' : '—'}</td></tr>; })}</tbody></table>{!states.length && <div className="search-empty">Nenhum estado encontrado.</div>}</div><div className="table-footnote"><span>{isLive ? 'Votos válidos apurados · TSE.' : baseline ? 'Votos válidos do 1º turno · TSE.' : '¹ Intervalo Flávio; Lula = 100 − limite oposto.'}</span><span>{isLive ? live?.data?.statesComplete ? '28 circunscrições' : 'Circunscrições parciais' : lab ? 'Cenário sintético' : baseline ? '100% totalizado' : 'Condicional · sem cobertura validada'}</span></div></section></div>

      {isLive && <section className="live-feed panel"><SectionTitle index="04" title="Últimos boletins" right={<span className="section-sub">Consulta a cada 30 segundos</span>} /><div className="live-status-detail"><Radio size={20} /><div><strong>{live?.data ? `Último boletim: ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(live.data.generatedAt))}` : 'Nenhum boletim oficial recebido'}</strong><p>{live?.message ?? 'Consultando disponibilidade do serviço…'}</p></div><span>{live?.status === 'stale' ? 'Desatualizado · ' : ''}{ageLabel}</span></div><LiveHistory bulletin={live?.data ?? null} estimate={nowcast?.national?.flavioShare != null && nowcast.national.interval80 ? { flavioShare: nowcast.national.flavioShare, interval80: nowcast.national.interval80 } : null} /></section>}

      {mode === 'comparison' && <ComparisonPanel projection={comparisonBase} states={live?.data?.states ?? []} frozen={frozen?.frozen ?? false} />}

      <div className="analysis-grid"><section className="polls-panel panel"><SectionTitle index="04" title="Pesquisas × modelo" right={<CircleHelp size={14} />} /><div className="poll-comparison"><div><span>Média parcial das pesquisas</span><div className="poll-pair"><div><small>Flávio</small><strong className="blue-text">{polls ? decimal.format(polls.average.flavio) : '—'}<small>%</small></strong></div><div><small>Lula</small><strong className="red-text">{polls ? decimal.format(polls.average.lula) : '—'}<small>%</small></strong></div></div><span>{polls ? `${polls.average.count} publicações · válidos · sem ajuste` : 'Carregando publicações'}</span></div><ArrowRight size={20} /><div><span>{lab ? 'Cenário sintético' : 'Projeção condicional'}</span><div className="poll-pair"><div><small>Flávio</small><strong className="blue-text">{summary ? decimal.format(summary.flavio.share * 100) : '—'}<small>%</small></strong></div><div><small>Lula</small><strong className="red-text">{summary ? decimal.format(summary.lula.share * 100) : '—'}<small>%</small></strong></div></div><span>{summary ? <>IC80% · Flávio {interval(summary.flavio)}<br />Lula {interval(summary.lula)}</> : 'Sem projeção publicada'}</span></div></div><div className="research-note"><span className="mini-line" /><p>{lab ? 'O laboratório usa premissas didáticas. Não representa uma correção das pesquisas.' : 'A projeção condicional parte da média parcial, sem correção de viés no cenário-base. A matriz define a distribuição territorial; hipóteses não observadas e a incerteza aparecem abaixo.'}</p></div><a className="inline-link" href="/documentos/leitura">Leia a análise e seus limites <ArrowUpRight size={13} /></a></section>

      <section className="distribution-panel panel"><SectionTitle index="05" title="A incerteza, à vista" right={<span className="section-sub">{lab ? 'Cenário sintético' : activeForecast ? '20.000 simulações · condicional' : '20.000 simulações previstas'}</span>} /><div className="histogram"><div className="hist-zero" hidden={!!summary} /><div className="hist-bars" aria-label={summary ? lab ? 'Histograma da margem no cenário sintético' : 'Histograma da margem condicional às premissas' : 'Distribuição ainda não calculada'}>{summary && activeForecast?.histogram.length ? [...activeForecast.histogram].reverse().map((bin, i) => <div key={i} className={bin.margin >= 0 ? 'hist-blue' : 'hist-red'} style={{ height: `${Math.max(1, bin.count / maxBin * 100)}%` }} title={`Margem ${decimal.format(bin.margin)} pp: ${number.format(bin.count)} simulações`} />) : <div className="hist-empty"><Activity size={22} /><span>{calculating && draft ? <>Rascunho atualizado.<br />Distribuição e intervalos em cálculo.</> : <>A distribuição será calculada<br />com entradas verificadas.</>}</span></div>}</div><div className="hist-axis"><span className="blue-text">Flávio · margem positiva</span><span>Margem em pp</span><span className="red-text">Lula · margem negativa</span></div></div><div className="distribution-note"><span>Intervalo central de 80%</span><strong>{interval(summary?.flavio)}</strong></div></section></div>

      {polls && <section className="poll-evidence panel"><SectionTitle index="↳" title="Pesquisas localizadas" right={<Tag muted>Levantamento parcial</Tag>} /><div className="poll-evidence-note"><p>{polls.scope}</p><strong>Registros publicados pelos institutos · consulta direta ao PesqEle indisponível (HTTP 403).</strong><p>{polls.average.method}</p></div><div className="poll-evidence-list">{polls.polls.map(poll => <details key={poll.id}><summary><div><strong>{poll.institute}</strong><span>{poll.fieldStart.split('-').slice(1).reverse().join('/')}–{poll.fieldEnd.split('-').slice(1).reverse().join('/')} · {number.format(poll.sample)} entrevistas</span></div><span className="poll-evidence-candidates"><span className="blue-text">Flávio {decimal.format(poll.candidates[0].percent)}%</span><span className="red-text">Lula {decimal.format(poll.candidates[1].percent)}%</span></span><span className="poll-denominator">{poll.denominator === 'valid' ? 'Válidos' : 'Totais · fora da média'}</span><ChevronDown size={13} /></summary><div className="poll-evidence-detail"><p><strong>Contratante:</strong> {poll.sponsor}</p><p><strong>Campo:</strong> {poll.fieldStart} a {poll.fieldEnd} · <strong>Método:</strong> {poll.method}</p><p><strong>Registro declarado:</strong> {poll.registration} · {poll.includedInPartialAverage ? 'Incluída na média parcial' : 'Não incluída na média parcial'}</p><a href={poll.sourceUrl} target="_blank" rel="noreferrer">Publicação primária <ArrowUpRight size={12} /></a></div></details>)}</div><div className="poll-evidence-footer"><span>Atualizado {new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(polls.asOf))} BRT</span><a href="/documentos/fontes">Fontes, lacunas e arquivos <ArrowUpRight size={12} /></a></div></section>}

      <ForecastAssumptions forecast={forecast} active={activeForecast} flows={flows} lab={lab} values={{ otherTransferPct: transfer, abstentionDeltaPp: abstentionDelta, biasCorrection, syntheticAbstention: abstention, syntheticUncertainty: uncertainty, groupShares }} onChange={(key, value) => { setMode('projection'); setLayer('Projeção'); if (!lab) setDraft(true); if (key === 'otherTransferPct') setTransfer(value); if (key === 'abstentionDeltaPp') setAbstentionDelta(value); if (key === 'biasCorrection') setBiasCorrection(value); if (key === 'syntheticAbstention') setAbstention(value); if (key === 'syntheticUncertainty') setUncertainty(value); }} onGroupChange={(source, value) => { setMode('projection'); setLayer('Projeção'); setDraft(true); setGroupShares(previous => ({ ...previous, [source]: value })); }} reset={resetScenario} calculating={calculating} progress={progress} error={workerError} />

      <div className="bottom-grid"><BacktestPanel /><section className="sources-panel panel"><SectionTitle index="08" title="Método e fontes" right={<button className="icon-button" aria-label={expandedMethod ? 'Recolher método' : 'Expandir método'} onClick={() => setExpandedMethod(!expandedMethod)}><ChevronDown size={15} className={expandedMethod ? 'rotated' : ''} /></button>} /><div className="source-row"><span className="source-icon"><Database size={15} /></span><div><strong>TSE · dados e divulgação</strong><span>Apuração oficial e resultados eleitorais</span></div><a href="https://resultados.tse.jus.br" target="_blank" rel="noreferrer" aria-label="Abrir resultados do TSE"><ArrowUpRight size={15} /></a></div><div className="source-row"><span className="source-icon"><Globe2 size={15} /></span><div><strong>IBGE · território</strong><span>Malhas e identificação geográfica</span></div><a href="https://servicodados.ibge.gov.br/api/docs/malhas?versao=3" target="_blank" rel="noreferrer" aria-label="Abrir documentação IBGE"><ArrowUpRight size={15} /></a></div><AnimatePresence>{expandedMethod && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduced ? 0 : .2 }} className="method-summary"><p>A matriz conserva o eleitorado. A calibração logística mantém percentuais entre 0 e 100. As simulações separam erros nacionais, regionais e locais. Probabilidades só são publicadas com parâmetros e entradas validados.</p></motion.div>}</AnimatePresence><div className="source-links"><a href="/documentos/metodo">Método <ArrowUpRight size={11} /></a><a href="/documentos/fontes">Fontes <ArrowUpRight size={11} /></a><a href="/documentos/decisoes">Decisões <ArrowUpRight size={11} /></a></div></section></div>

      <footer><div><span className="footer-mark"><Activity size={14} /></span><span>Observatório <span className="footer-year">/ 2026</span></span><span className="footer-separator">·</span><span>Incerteza faz parte do resultado.</span></div><div><span>*Calendário e candidaturas: TSE. Hipóteses e limites em Método e Fontes.</span><a href="/documentos/notas">Notas de transparência <ArrowUpRight size={12} /></a></div></footer>
    </div>
  </main>;
}

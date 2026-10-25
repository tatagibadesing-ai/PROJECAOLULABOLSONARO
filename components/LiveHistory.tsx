'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock3, Radio } from 'lucide-react';

type Bulletin = { electionId: string; generatedAt: string; sections: { total: number; counted: number; percent: number }; candidates: { id: string; name: string; votes: number; percent: number }[] };
type Estimate = { flavioShare: number; interval80: [number, number] };
type Entry = { electionId: string; generatedAt: string; receivedAt: string; percent: number; flavioVotes: number; lulaVotes: number; flavioShare: number | null; estimate: Estimate | null };
const time = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
const number = new Intl.NumberFormat('pt-BR');
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function validEntry(value: unknown): value is Entry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Entry;
  return typeof e.electionId === 'string' && Number.isFinite(Date.parse(e.generatedAt)) && Number.isFinite(Date.parse(e.receivedAt)) && Number.isFinite(e.percent) && e.percent >= 0 && e.percent <= 100 && Number.isSafeInteger(e.flavioVotes) && e.flavioVotes >= 0 && Number.isSafeInteger(e.lulaVotes) && e.lulaVotes >= 0 && (e.flavioShare === null || Number.isFinite(e.flavioShare) && e.flavioShare >= 0 && e.flavioShare <= 1) && (e.estimate === null || Number.isFinite(e.estimate?.flavioShare) && Array.isArray(e.estimate.interval80) && e.estimate.interval80.length === 2 && e.estimate.interval80.every(n => Number.isFinite(n) && n >= 0 && n <= 1));
}

export default function LiveHistory({ bulletin, estimate }: { bulletin: Bulletin | null; estimate?: Estimate | null }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const memory = useRef<Entry[]>([]);
  useEffect(() => {
    if (!bulletin) return;
    const key = `observatorio:boletins:${bulletin.electionId}`;
    let previous: Entry[] = memory.current.filter(e => e.electionId === bulletin.electionId);
    try { const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); if (Array.isArray(raw)) previous = raw.filter(validEntry).filter(e => e.electionId === bulletin.electionId); } catch { setStorageAvailable(false); }
    const flavio = bulletin.candidates.find(c => c.id === 'flavio')?.votes ?? 0;
    const lula = bulletin.candidates.find(c => c.id === 'lula')?.votes ?? 0;
    if (![flavio, lula].every(n => Number.isSafeInteger(n) && n >= 0) || !Number.isFinite(Date.parse(bulletin.generatedAt))) return;
    const existing = previous.find(e => e.generatedAt === bulletin.generatedAt);
    if (!existing) previous.push({ electionId: bulletin.electionId, generatedAt: bulletin.generatedAt, receivedAt: new Date().toISOString(), percent: bulletin.sections.percent, flavioVotes: flavio, lulaVotes: lula, flavioShare: flavio + lula > 0 ? flavio / (flavio + lula) : null, estimate: estimate ?? null });
    else if (!existing.estimate && estimate) existing.estimate = estimate;
    const next = previous.sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt)).slice(-360);
    memory.current = next;
    setEntries(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { setStorageAvailable(false); }
  }, [bulletin?.generatedAt, bulletin?.electionId, estimate?.flavioShare, estimate?.interval80[0], estimate?.interval80[1]]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/historico', { signal: controller.signal, cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => {
      if (!Array.isArray(data?.points)) return;
      const server: Entry[] = data.points.map((p: Record<string, unknown>) => ({ electionId: p.electionId, generatedAt: p.generatedAt, receivedAt: p.receivedAt, percent: typeof p.sectionsTotal === 'number' && p.sectionsTotal > 0 ? Number(p.sectionsCounted) / p.sectionsTotal * 100 : 0, flavioVotes: p.flavioVotes, lulaVotes: p.lulaVotes, flavioShare: p.flavioShare, estimate: null })).filter(validEntry).filter((entry: Entry) => !bulletin || entry.electionId === bulletin.electionId);
      const merged = new Map([...server, ...memory.current].map(entry => [entry.generatedAt, entry]));
      const next = [...merged.values()].sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt)).slice(-360);
      memory.current = next; setEntries(next);
    }).catch(() => {});
    return () => controller.abort();
  }, [bulletin?.generatedAt, bulletin?.electionId]);
  const points = entries.filter(e => e.flavioShare !== null);
  const earliest = points.length ? Date.parse(points[0].generatedAt) : 0;
  const latest = points.length > 1 ? Date.parse(points[points.length - 1].generatedAt) : earliest + 30000;
  const x = (entry: Entry) => 30 + (Date.parse(entry.generatedAt) - earliest) / Math.max(1, latest - earliest) * 880;
  const amplitude = Math.max(.01, ...points.flatMap(e => [Math.abs(e.flavioShare! - .5), ...(e.estimate ? e.estimate.interval80.map(v => Math.abs(v - .5)) : [])])) * 1.2;
  const y = (share: number) => 174 - (share - (.5 - amplitude)) / (amplitude * 2) * 140;
  const path = (kind: 'official' | 'estimate', side: 'flavio' | 'lula') => points.filter(e => kind === 'official' || e.estimate).map((e, i) => { const share = kind === 'official' ? e.flavioShare! : e.estimate!.flavioShare; return `${i ? 'L' : 'M'}${x(e)},${y(side === 'flavio' ? share : 1 - share)}`; }).join(' ');
  const band = (side: 'flavio' | 'lula') => {
    const estimated = points.filter(e => e.estimate);
    const top = estimated.map((e, i) => `${i ? 'L' : 'M'}${x(e)},${y(side === 'flavio' ? e.estimate!.interval80[1] : 1 - e.estimate!.interval80[0])}`).join(' ');
    const bottom = [...estimated].reverse().map(e => `L${x(e)},${y(side === 'flavio' ? e.estimate!.interval80[0] : 1 - e.estimate!.interval80[1])}`).join(' ');
    return `${top} ${bottom} Z`;
  };
  return <div className="live-history"><div className="history-title"><Clock3 size={14} /><h3>Linha do tempo</h3><span>{storageAvailable ? 'Boletins recebidos e salvos no PC' : 'Armazenamento local indisponível'}</span></div>{points.length ? <><div className="history-chart"><svg viewBox="0 0 940 215" role="img" aria-label="Votos oficiais recebidos e estimativa condicional ao longo do tempo"><path d="M30,104H910" stroke="#354253" strokeDasharray="4 5" /><text x="3" y="107" className="history-tick">50%</text>{(['flavio', 'lula'] as const).map(side => <g key={side}><path d={band(side)} fill={side === 'flavio' ? 'var(--blue)' : 'var(--red)'} fillOpacity={.1} /><path d={path('official', side)} fill="none" stroke={side === 'flavio' ? 'var(--blue)' : 'var(--red)'} strokeWidth="1.4" strokeDasharray="3 4" opacity=".5" /><path d={path('estimate', side)} fill="none" stroke={side === 'flavio' ? 'var(--blue)' : 'var(--red)'} strokeWidth="2" />{points.map(e => <circle key={e.generatedAt} cx={x(e)} cy={y(side === 'flavio' ? e.flavioShare! : 1 - e.flavioShare!)} r="2.5" fill={side === 'flavio' ? 'var(--blue)' : 'var(--red)'}><title>{time(e.generatedAt)} BRT · {side === 'flavio' ? 'Flávio' : 'Lula'} {decimal.format((side === 'flavio' ? e.flavioShare! : 1 - e.flavioShare!) * 100)}% dos válidos recebidos{e.estimate ? ` · estimativa condicional ${decimal.format((side === 'flavio' ? e.estimate.flavioShare : 1 - e.estimate.flavioShare) * 100)}%, IC80% ${decimal.format((side === 'flavio' ? e.estimate.interval80[0] : 1 - e.estimate.interval80[1]) * 100)}–${decimal.format((side === 'flavio' ? e.estimate.interval80[1] : 1 - e.estimate.interval80[0]) * 100)}%` : ''}</title></circle>)}</g>)}<text x="30" y="203" className="history-tick">{time(points[0].generatedAt)}</text><text x="910" y="203" textAnchor="end" className="history-tick">{time(points[points.length - 1].generatedAt)} BRT</text></svg></div><div className="history-legend"><span className="blue-text">Flávio</span><span className="red-text">Lula</span><span>Tracejado: apurado · contínuo: estimativa condicional · faixa: intervalo80% não validado</span></div></> : <div className="history-empty"><Radio size={18} /><p>A linha do tempo começa com o primeiro boletim com votos recebido neste navegador. Nenhum ponto é inventado.</p></div>}<p className="history-notice">Apenas boletins oficiais efetivamente recebidos. Os segmentos ligam observações; não são atualizações intermediárias do TSE. Estimativas são condicionais às premissas.</p><div className="history-feed">{[...entries].reverse().slice(0, 12).map(e => <div key={e.generatedAt}><time dateTime={e.generatedAt}>{time(e.generatedAt)} BRT</time><span>Seções: {decimal.format(e.percent)}%</span><span className="blue-text">Flávio {number.format(e.flavioVotes)}</span><span className="red-text">Lula {number.format(e.lulaVotes)}</span></div>)}</div></div>;
}

'use client';

import { useEffect, useState } from 'react';
import { Check, FlaskConical, Pause, Play, RotateCcw } from 'lucide-react';
import type { ReplayFrame, ReplayOrder } from '../lib/replay';

const number = new Intl.NumberFormat('pt-BR');
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export default function ReplayPanel() {
  const [step, setStep] = useState(0);
  const [order, setOrder] = useState<ReplayOrder>('totalization');
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState<ReplayFrame | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/ensaio?step=${step}&order=${order}`, { signal: controller.signal }).then(r => {
      if (!r.ok) throw new Error('Não foi possível carregar a reprodução.');
      return r.json();
    }).then(data => { setFrame(data); setError(''); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [step, order]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setStep(previous => { if (previous >= 95) { setPlaying(false); return 100; } return previous + 5; }), 800);
    return () => clearInterval(timer);
  }, [playing]);
  const candidates = frame?.data.candidates ? [...frame.data.candidates].sort((a, b) => a.number === '22' ? -1 : b.number === '22' ? 1 : a.number === '13' ? -1 : b.number === '13' ? 1 : b.votes - a.votes) : [];
  return <section className="replay-panel panel" aria-label="Reprodução do primeiro turno"><div className="section-heading"><div className="section-title"><FlaskConical size={15} /><h2>Reprodução do 1º turno · sequência simulada</h2></div><span className="tag">Ensaio</span></div><div className="replay-intro"><p>Dados reais de 2026 em ordem controlada. Não é apuração ao vivo nem projeção do 2º turno.</p><select aria-label="Ordem da reprodução" value={order} onChange={e => { setOrder(e.target.value as ReplayOrder); setStep(0); setPlaying(false); }}><option value="totalization">Horário final municipal</option><option value="state">Agrupada por estado</option><option value="timezone">Fuso aproximado da UF</option></select></div><div className="replay-controls"><button className="button" onClick={() => { if (step === 100) setStep(0); setPlaying(!playing); }}>{playing ? <Pause size={13} /> : <Play size={13} />}{playing ? 'Pausar' : 'Reproduzir'}</button><button className="icon-button" aria-label="Reiniciar reprodução" onClick={() => { setStep(0); setPlaying(false); }}><RotateCcw size={14} /></button><input type="range" aria-label="Etapa da reprodução" min="0" max="100" value={step} onChange={e => { setStep(Number(e.target.value)); setPlaying(false); }} /><strong>{frame ? decimal.format(frame.progress.percent) : '0,0'}%</strong><span>das localidades</span></div><div className="replay-progress"><span>{frame ? `${number.format(frame.progress.countedLocations)} de ${number.format(frame.progress.totalLocations)} localidades` : 'Carregando base verificada…'}</span><span>{frame?.complete ? <><Check size={12} /> Reprodução concluída</> : 'Municípios entram com seus totais completos'}</span></div>{error && <p role="alert" className="replay-error">{error}</p>}<div className="replay-candidates">{candidates.map(c => <div key={c.number} className={c.number === '22' ? 'blue-text' : c.number === '13' ? 'red-text' : ''}><span>{c.name}<small>{c.party}</small></span><strong>{number.format(c.votes)}</strong><small>{c.percent === null ? '—' : `${decimal.format(c.percent)}%`} válidos</small></div>)}</div><div className="replay-note"><p>{frame?.sequenceNote ?? 'O ensaio usa a base oficial agregada por município.'}</p><p>Não estima votos restantes. Cobertura do intervalo de 80% ainda não validada.</p></div></section>;
}

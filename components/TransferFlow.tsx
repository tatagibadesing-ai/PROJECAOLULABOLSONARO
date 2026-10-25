'use client';

import { formatName, type Destination, type ModelFlow } from '../lib/demo';

const destinations: Destination[] = ['flavio', 'lula', 'blank', 'null', 'abstention'];
const names: Record<string, string> = { flavio: 'Flávio Bolsonaro', lula: 'Lula', cury: 'Augusto Cury', renan: 'Renan Santos', caiado: 'Ronaldo Caiado', zema: 'Romeu Zema', left: 'Esquerda pequena', other: 'Outros candidatos', outros: 'Outros candidatos', blank: 'Brancos', null: 'Nulos', abstention: 'Abstenção', abstencao: 'Abstenção', blankNull: 'Brancos e nulos', 'brancos-nulos': 'Brancos e nulos', '22': 'Flávio Bolsonaro', '13': 'Lula', '70': 'Augusto Cury', '14': 'Renan Santos', '55': 'Ronaldo Caiado', '30': 'Romeu Zema', 'esquerda-pequena': 'Esquerda pequena', notInstalled: 'Seções não instaladas' };
const nf = new Intl.NumberFormat('pt-BR');
const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const color = (id: string) => id === 'flavio' ? 'var(--blue)' : id === 'lula' ? 'var(--red)' : '#8694a8';
const sourceName = (id: string) => names[id] ?? names[id.replace(/^candidate:/, '').replace(/^first:/, '')] ?? id.replaceAll('_', ' ');

export default function TransferFlow({ flows, synthetic = false }: { flows: ModelFlow[]; synthetic?: boolean }) {
  const priority = (source: string) => ['flavio', 'candidate:22', '22'].includes(source) ? 0 : ['lula', 'candidate:13', '13'].includes(source) ? 1 : 2;
  flows = [...flows].sort((a, b) => priority(a.source) - priority(b.source) || b.count - a.count);
  const total = flows.reduce((sum, row) => sum + row.count, 0);
  if (!total) return null;
  const height = Math.max(560, flows.length * 36);
  const flowHeight = height - (flows.length - 1) * 22;
  const scale = flowHeight / total;
  const targetTotals = destinations.map(d => flows.reduce((sum, row) => sum + (row.destinations[d] ?? 0), 0));
  let sourceY = 35;
  const sourceRows = flows.map(flow => { const row = { ...flow, y: sourceY, h: flow.count * scale }; sourceY += row.h + 22; return row; });
  let targetY = 35;
  const targetRows = destinations.map((id, i) => { const row = { id, total: targetTotals[i], y: targetY, h: targetTotals[i] * scale }; targetY += row.h + (height - flowHeight) / 4; return row; });
  const targetOffsets = destinations.map(() => 0);
  const paths = sourceRows.flatMap(source => {
    let sourceOffset = 0;
    return destinations.map((destination, i) => {
      const count = source.destinations[destination] ?? 0;
      const h = count * scale, y1 = source.y + sourceOffset, y2 = targetRows[i].y + targetOffsets[i];
      sourceOffset += h; targetOffsets[i] += h;
      return { key: `${source.source}-${destination}`, count, destination, source: source.source, path: `M190,${y1} C405,${y1} 475,${y2} 690,${y2} L690,${y2 + h} C475,${y2 + h} 405,${y1 + h} 190,${y1 + h} Z` };
    });
  });
  return <div className="quantitative-flow"><div className="flow-explainer"><p>A espessura de cada fluxo corresponde ao número de eleitores distribuídos pela matriz.</p><strong>{synthetic ? 'Dados sintéticos' : 'Contagens oficiais de origem · destinos assumidos, não observados'}</strong></div><div className="flow-scroll"><svg viewBox={`0 0 960 ${height + 70}`} role="img" aria-label={synthetic ? 'Fluxo quantitativo sintético' : 'Fluxo quantitativo condicional às premissas de transferência'}>
    <text x="184" y="15" textAnchor="end" className="flow-column-label">Comportamento no 1º turno</text><text x="706" y="15" className="flow-column-label">Destino condicional no 2º turno</text>
    {paths.filter(path => path.count > 0).map(path => <path key={path.key} d={path.path} fill={color(path.destination)} fillOpacity={.27}><title>{sourceName(path.source)} → {sourceName(path.destination)}: aproximadamente {nf.format(Math.round(path.count))} eleitores · hipótese, não medição</title></path>)}
    {sourceRows.map(row => <g key={row.source}><rect x="183" y={row.y} width="7" height={Math.max(.7, row.h)} fill="#8c9caf" /><text x="171" y={row.y + row.h / 2 - 2} textAnchor="end" dominantBaseline="middle" className="flow-node-name">{formatName(row.name ?? sourceName(row.source))}</text><text x="171" y={row.y + row.h / 2 + 10} textAnchor="end" dominantBaseline="middle" className="flow-node-count">{nf.format(row.count)}</text></g>)}
    {targetRows.map(row => <g key={row.id}><rect x="690" y={row.y} width="7" height={Math.max(.7, row.h)} fill={color(row.id)} /><text x="708" y={row.y + row.h / 2 - 2} dominantBaseline="middle" className="flow-node-name" fill={color(row.id)}>{sourceName(row.id)}</text><text x="708" y={row.y + row.h / 2 + 11} dominantBaseline="middle" className="flow-node-count">≈ {nf.format(Math.round(row.total / 1000) * 1000)}</text></g>)}
  </svg></div><details className="transfer-matrix"><summary>Ver a matriz completa de transferência</summary><div className="matrix-scroll"><table><thead><tr><th>Origem</th>{destinations.map(d => <th key={d}>{sourceName(d)}</th>)}</tr></thead><tbody>{flows.map(row => <tr key={row.source}><td>{formatName(row.name ?? sourceName(row.source))}{row.origin && <small>{row.origin}</small>}</td>{destinations.map(d => <td key={d}>{row.count ? percent.format(row.destinations[d] / row.count * 100) : '0'}%</td>)}</tr>)}</tbody></table></div><p>Cada linha fecha em 100% antes do arredondamento. Matriz condicional após calibração. Cruzamentos publicados e hipóteses para destinos não observados são identificados por origem abaixo.</p></details></div>;
}

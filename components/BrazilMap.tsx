'use client';

import { useEffect, useState } from 'react';
import { stateInfo, type ModelSummary } from '../lib/demo';

type Feature = { properties: Record<string, string | number>; geometry: { type: string; coordinates: number[][][][] | number[][][] } };
type Collection = { features: Feature[] };
const project = ([lon, lat]: number[]) => [(lon + 75) * 11, (-lat + 7) * 10.4];
function pathFor(feature: Feature) {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates as number[][][]] : feature.geometry.coordinates as number[][][][];
  return polygons.map(polygon => polygon.map(ring => ring.map((point, i) => `${i ? 'L' : 'M'}${project(point).join(',')}`).join(' ') + 'Z').join(' ')).join(' ');
}

export default function BrazilMap({ selected, onSelect, results, synthetic, official, officialLabel = '1º turno oficial', conditional = false, differences }: { selected: string; onSelect: (uf: string) => void; results?: ModelSummary[]; synthetic: boolean; official?: { id: string; valid: number; votes: Record<string, number> }[]; officialLabel?: string; conditional?: boolean; differences?: Record<string, number> }) {
  const [geo, setGeo] = useState<Collection | null>(null);
  useEffect(() => { fetch('/data/states.geojson').then(r => r.ok ? r.json() : null).then(setGeo).catch(() => {}); }, []);
  const fill = (uf: string) => {
    const difference = differences?.[uf];
    if (typeof difference === 'number') return `oklch(${31 + Math.min(Math.abs(difference) * 250, 19)}% ${.025 + Math.min(Math.abs(difference) * 1.25, .12)} ${difference >= 0 ? 255 : 25})`;
    const result = synthetic || conditional ? results?.find(x => x.id === uf) : undefined;
    const real = official?.find(x => x.id === uf);
    if (!result && !real) return selected === uf ? 'oklch(36% .018 255)' : 'oklch(22% .012 255)';
    const margin = result ? (result.flavio.share - result.lula.share) / 2 : ((real!.votes['22'] ?? 0) - (real!.votes['13'] ?? 0)) / real!.valid / 2;
    const certainty = conditional && result ? Number.isFinite(result.flavio.winProbability) ? Math.abs(result.flavio.winProbability - .5) * 2 : 0 : Math.min(1, Math.abs(margin) * 5);
    return `oklch(${31 + certainty * 19}% ${.025 + certainty * .095} ${margin >= 0 ? 255 : 25})`;
  };
  const stateFromFeature = (feature: Feature) => String(feature.properties.uf ?? feature.properties.id ?? feature.properties.sigla ?? feature.properties.SIGLA_UF ?? feature.properties.abbrev_state ?? feature.properties.codarea ?? '');
  return <div className="brazil-map">
    <div className="map-coordinate coordinate-left">05° N<br />34° S</div>
    <svg viewBox="0 0 530 475" role="img" aria-label={geo ? 'Mapa dos estados brasileiros' : 'Cartograma esquemático dos estados brasileiros'}>
      <defs><pattern id="map-grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M 36 0 L 0 0 0 36" fill="none" stroke="currentColor" strokeWidth=".4" /></pattern></defs>
      <rect width="530" height="475" fill="url(#map-grid)" className="map-grid" />
      {geo?.features?.length ? geo.features.map((feature, index) => {
        const raw = stateFromFeature(feature);
        const numericMap: Record<string, string> = {'11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF'};
        const uf = numericMap[raw] ?? raw;
        const name = stateInfo.find(x => x[0] === uf)?.[1] ?? uf;
        return <path key={`${uf}-${index}`} d={pathFor(feature)} fill={fill(uf)} className={`state-path ${selected === uf ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={`Selecionar ${name}`} onClick={() => onSelect(uf)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(uf); }}><title>{name}{synthetic ? ' · cenário sintético' : conditional ? ' · projeção condicional às premissas' : differences ? ' · diferença final ante o cenário condicional' : official ? ` · ${officialLabel}` : ' · aguardando dados'}</title></path>;
      }) : stateInfo.filter(x => x[0] !== 'ZZ').map(([uf, name, , x, y]) => {
        const px = 38 + x * 47 + y % 2 * 23.5, py = 17 + y * 40;
        return <g key={uf} role="button" tabIndex={0} aria-label={`Selecionar ${name}`} onClick={() => onSelect(uf)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(uf); }} className={`map-state ${selected === uf ? 'selected' : ''}`}>
          <path d={`M${px + 23},${py} l23,13 v26 l-23,13 l-23,-13 v-26 Z`} fill={fill(uf)} />
          <text x={px + 23} y={py + 29} textAnchor="middle">{uf}</text>
        </g>;
      })}
      <text x="426" y="432" className="ocean-label">Atlântico</text>
      <path d="M465,365 v-30 m-5,7 l5,-7 l5,7" className="north-arrow" /><text x="465" y="325" textAnchor="middle" className="north-text">N</text>
    </svg>
    <span className="map-footnote">{geo ? 'Malha de estados · IBGE' : 'Cartograma esquemático · áreas sem escala'}</span>
  </div>;
}

'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export type MunicipalResult = { share: number; low?: number; high?: number };
export type MunicipalMapProps = {
  uf: string;
  onSelectCity: (tseId: string) => void;
  cityResults?: Record<string, MunicipalResult>;
  selectedCityId?: string;
  label?: string;
};
type Point = [number, number];
type Feature = {
  type: 'Feature';
  properties: { id: string | null; ibgeCode: string; uf: string; name: string; match: string | null };
  geometry: { type: 'Polygon'; coordinates: Point[][] } | { type: 'MultiPolygon'; coordinates: Point[][][] };
};
type Collection = { features: Feature[]; coverage: { matched: number; total: number; unmatched: number }; sourceYear: number };
type Drawn = { feature: Feature; path: Path2D };
type Layers = { base: HTMLCanvasElement; pick: CanvasRenderingContext2D; paths: Drawn[]; dpr: number; width: number; height: number };
const projected = ([lon, lat]: Point): Point => [lon, -Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI];
function rings(feature: Feature): Point[][] {
  return feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
}
function fill(result?: MunicipalResult): string {
  if (!result || !Number.isFinite(result.share)) return 'oklch(27% 0 0)';
  const margin = Math.min(.5, Math.abs(result.share - .5));
  const crosses = result.low !== undefined && result.high !== undefined && result.low <= .5 && result.high >= .5;
  const strength = Math.min(1, margin * 6) * (crosses ? .5 : 1);
  // Both candidates always use the same lightness and chroma at the same margin.
  return `oklch(${28 + strength * 30}% ${strength * .16} ${result.share >= .5 ? 255 : 25})`;
}

function describeResult(result: MunicipalResult): string {
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const hasInterval = result.low !== undefined && result.high !== undefined;
  const blue = hasInterval ? ` (${percent(result.low!)}–${percent(result.high!)})` : '';
  const red = hasInterval ? ` (${percent(1 - result.high!)}–${percent(1 - result.low!)})` : '';
  return `Flávio ${percent(result.share)}${blue} · Lula ${percent(1 - result.share)}${red}${hasInterval ? ' · intervalo de 80%' : ''}`;
}

export default function MunicipalMap({ uf, onSelectCity, cityResults, selectedCityId, label = 'Projeção condicional' }: MunicipalMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layers = useRef<Layers | null>(null);
  const frame = useRef<number>(0);
  const pointer = useRef<Point | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [hovered, setHovered] = useState<Feature | null>(null);

  useEffect(() => {
    setCollection(null); setError(null); setHovered(null); layers.current = null;
    if (uf === 'ZZ') { setError('O exterior é apresentado por localidade eleitoral na lista, sem limites municipais brasileiros.'); return; }
    if (!/^[A-Z]{2}$/.test(uf)) { setError('Abrangência cartográfica inválida.'); return; }
    const controller = new AbortController();
    fetch(`/data/municipalities/${uf}.json`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Não foi possível carregar a malha municipal.'); return response.json(); })
      .then((data: Collection) => { if (!Array.isArray(data.features)) throw new Error('Malha municipal inválida.'); setCollection(data); })
      .catch((reason: Error) => { if (reason.name !== 'AbortError') setError(reason.message); });
    return () => controller.abort();
  }, [uf]);

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => {
      const width = Math.max(240, Math.round(entries[0].contentRect.width));
      const height = Math.max(280, Math.min(460, Math.round(width * .68)));
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const target = canvas.current;
    if (!target || !collection?.features.length) return;
    const started = performance.now();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    target.width = Math.round(size.width * dpr); target.height = Math.round(size.height * dpr);
    const base = document.createElement('canvas'); base.width = target.width; base.height = target.height;
    const pickCanvas = document.createElement('canvas'); pickCanvas.width = size.width; pickCanvas.height = size.height;
    const ctx = base.getContext('2d'); const pick = pickCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !pick) return;
    ctx.scale(dpr, dpr); ctx.lineJoin = 'round';
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const feature of collection.features) for (const ring of rings(feature)) for (const point of ring) {
      const [x, y] = projected(point); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const scale = Math.min((size.width - 24) / Math.max(.001, x1 - x0), (size.height - 24) / Math.max(.001, y1 - y0));
    const dx = (size.width - (x1 - x0) * scale) / 2, dy = (size.height - (y1 - y0) * scale) / 2;
    const paths = collection.features.map((feature, index): Drawn => {
      const path = new Path2D();
      for (const ring of rings(feature)) {
        ring.forEach((point, pointIndex) => {
          const [px, py] = projected(point); const x = dx + (px - x0) * scale, y = dy + (py - y0) * scale;
          if (pointIndex === 0) path.moveTo(x, y); else path.lineTo(x, y);
        });
        path.closePath();
      }
      const id = feature.properties.id;
      ctx.fillStyle = fill(id ? cityResults?.[id] : undefined); ctx.fill(path, 'evenodd');
      ctx.strokeStyle = 'oklch(13% .006 255)'; ctx.lineWidth = .45; ctx.stroke(path);
      const color = index + 1;
      pick.fillStyle = `rgb(${color & 255}, ${(color >>> 8) & 255}, ${(color >>> 16) & 255})`; pick.fill(path, 'evenodd');
      return { feature, path };
    });
    layers.current = { base, pick, paths, dpr, width: size.width, height: size.height };
    target.dataset.renderMs = (performance.now() - started).toFixed(2);
    target.dataset.featureCount = String(paths.length);
    paint(hovered);
    // Geometry and picking buffers are rebuilt only when the map or viewport changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, size]);

  useEffect(() => {
    const layer = layers.current;
    if (!layer) return;
    const started = performance.now(), ctx = layer.base.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(layer.dpr, 0, 0, layer.dpr, 0, 0);
    ctx.clearRect(0, 0, layer.width, layer.height);
    for (const item of layer.paths) {
      const id = item.feature.properties.id;
      ctx.fillStyle = fill(id ? cityResults?.[id] : undefined); ctx.fill(item.path, 'evenodd');
      ctx.strokeStyle = 'oklch(13% .006 255)'; ctx.lineWidth = .45; ctx.stroke(item.path);
    }
    if (canvas.current) canvas.current.dataset.updateMs = (performance.now() - started).toFixed(2);
    paint(hovered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityResults]);

  function paint(hover: Feature | null) {
    const target = canvas.current, layer = layers.current;
    if (!target || !layer) return;
    const started = performance.now(), ctx = target.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, target.width, target.height); ctx.drawImage(layer.base, 0, 0);
    ctx.setTransform(layer.dpr, 0, 0, layer.dpr, 0, 0);
    for (const item of layer.paths) if (item.feature.properties.id === selectedCityId || item.feature.properties.ibgeCode === hover?.properties.ibgeCode) {
      ctx.strokeStyle = 'oklch(88% .006 255)'; ctx.lineWidth = item.feature.properties.id === selectedCityId ? 2 : 1.3; ctx.stroke(item.path);
    }
    target.dataset.lastPaintMs = (performance.now() - started).toFixed(2);
  }
  useEffect(() => { paint(hovered); });
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function at(point: Point): Feature | null {
    const layer = layers.current;
    if (!layer || point[0] < 0 || point[1] < 0 || point[0] >= layer.width || point[1] >= layer.height) return null;
    const pixel = layer.pick.getImageData(Math.floor(point[0]), Math.floor(point[1]), 1, 1).data;
    const index = pixel[0] + (pixel[1] << 8) + (pixel[2] << 16) - 1;
    const candidate = layer.paths[index];
    // Border antialiasing can mix pick colors; verify the candidate's actual polygon.
    return candidate && layer.pick.isPointInPath(candidate.path, point[0], point[1], 'evenodd') ? candidate.feature : null;
  }
  function pointFrom(event: { currentTarget: HTMLCanvasElement; clientX: number; clientY: number }): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - rect.left) * (layers.current?.width ?? rect.width) / rect.width, (event.clientY - rect.top) * (layers.current?.height ?? rect.height) / rect.height];
  }
  function onMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointer.current = pointFrom(event);
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const feature = pointer.current ? at(pointer.current) : null;
      setHovered(previous => previous?.properties.ibgeCode === feature?.properties.ibgeCode ? previous : feature);
      paint(feature);
    });
  }
  const name = hovered?.properties.name;
  const hoveredResult = hovered?.properties.id ? cityResults?.[hovered.properties.id] : undefined;
  const options = collection?.features.filter(feature => feature.properties.id) ?? [];
  return <div ref={container} className="municipal-map" data-testid="municipal-map" style={{ width: '100%', minWidth: 0 }}>
    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', minHeight: 38 }}>
      <span>{name ?? `Municípios · ${uf === 'BR' ? 'Brasil' : uf}`}</span>
      <span className="muted" style={{ fontSize: 12, textAlign: 'right', maxWidth: '65%' }}>{hoveredResult ? describeResult(hoveredResult) : label}</span>
    </div>
    {error ? <p role="status" className="muted">{error}</p> : <>
      {!collection && <p role="status" className="muted">Carregando limites municipais do IBGE…</p>}
      <canvas ref={canvas} role="img" aria-label={`Mapa de municípios de ${uf}. Use a lista abaixo como alternativa ao toque no mapa.`}
        style={{ width: '100%', height: size.height, display: 'block', cursor: hovered?.properties.id ? 'pointer' : 'default' }}
        onPointerMove={onMove} onPointerLeave={() => { pointer.current = null; setHovered(null); paint(null); }}
        onClick={event => { const feature = at(pointFrom(event)); if (feature?.properties.id) onSelectCity(feature.properties.id); }} />
      {collection && <>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}><span className="muted" style={{ fontSize: 12 }}>Município</span>
          <select aria-label="Selecionar município no mapa" value={selectedCityId ?? ''} onChange={event => { if (event.target.value) onSelectCity(event.target.value); }} style={{ flex: 1, minWidth: 0, background: 'var(--panel, #17191f)', color: 'inherit', border: '1px solid var(--line, #30323a)', borderRadius: 5, padding: '7px 9px' }}>
            <option value="">Escolha na lista ou no mapa</option>
            {options.map(feature => <option key={feature.properties.id} value={feature.properties.id!}>{feature.properties.name}</option>)}
          </select>
        </label>
        <p className="muted" style={{ fontSize: 11, margin: '9px 0' }}>Limites municipais · IBGE {collection.sourceYear} · {collection.coverage.matched.toLocaleString('pt-BR')} correspondências verificadas{collection.coverage.unmatched ? ` · ${collection.coverage.unmatched} áreas sem associação eleitoral, em cinza` : ''}. {cityResults ? `${label}.` : 'Sem estimativa: áreas em cinza.'}</p>
      </>}
    </>}
  </div>;
}

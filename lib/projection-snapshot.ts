import { createHash } from 'node:crypto';

export const FREEZE_DEADLINE = '2026-10-25T20:00:00.000Z';
export type Snapshot = Record<string, unknown> & { status: string; frozen: boolean; generatedAt: string | null; sha256: string | null; projection: unknown };

/** Stable JSON: object key order cannot change the signature; array order remains meaningful. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Número não finito no documento.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object' && value !== null) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson((value as Record<string, unknown>)[key])).join(',') + '}';
  throw new Error('Conteúdo não serializável no documento.');
}

export function snapshotHash(snapshot: Record<string, unknown>): string {
  const { sha256: ignored, ...body } = snapshot;
  void ignored;
  return createHash('sha256').update(canonicalJson(body)).digest('hex');
}

export function assertCanFreeze(options: {
  now: string;
  existingFrozen: boolean;
  forecast: { scenario: string; simulations: number; generatedAt: string; publicationReady: boolean; cities: unknown[]; audit: { violations: number; drawsChecked: number; electorate: number }; provenance: { sources: unknown[]; limitations: unknown[] } };
  live: { source: string; status: string; fetchedAt: string | null; data: { electionId: string; round: number; sections: { counted: number; total: number }; candidates: { votes: number }[] } | null };
}): void {
  const { forecast, live } = options;
  const now = Date.parse(options.now);
  if (!Number.isFinite(now) || now >= Date.parse(FREEZE_DEADLINE)) throw new Error('Prazo de congelamento encerrado; não é permitido criar previsão retroativa.');
  if (options.existingFrozen) throw new Error('A projeção já está congelada e não pode ser substituída.');
  if (forecast.scenario !== 'conditional' || forecast.publicationReady !== false) throw new Error('Este procedimento aceita apenas cenários condicionais explicitamente não validados.');
  if (!Number.isFinite(Date.parse(forecast.generatedAt)) || Date.parse(forecast.generatedAt) > now || forecast.simulations !== 20000 || forecast.cities.length < 5571) throw new Error('Execução de 20.000 simulações municipais incompleta ou data inválida.');
  if (forecast.audit.violations !== 0 || forecast.audit.drawsChecked !== forecast.cities.length * forecast.simulations || forecast.audit.electorate !== 158745502) throw new Error('A conservação do eleitorado não foi comprovada para todas as simulações.');
  if (!forecast.provenance.sources.length || !forecast.provenance.limitations.length) throw new Error('Fontes e limitações são obrigatórias.');
  if (live.source !== 'TSE' || live.status !== 'waiting' || !live.data || live.data.electionId !== '6258' || live.data.round !== 2 || live.data.sections.total !== 499248 || live.data.sections.counted !== 0 || live.data.candidates.some(candidate => candidate.votes !== 0)) throw new Error('O TSE não comprovou ausência de votos do segundo turno; congelamento bloqueado.');
  if (!live.fetchedAt || !Number.isFinite(Date.parse(live.fetchedAt)) || now - Date.parse(live.fetchedAt) > 30_000 || Date.parse(live.fetchedAt) > now) throw new Error('É necessária uma consulta oficial nova, não um cache antigo.');
}

export function verifySnapshot(input: unknown): Snapshot {
  if (!input || typeof input !== 'object') throw new Error('Arquivo de projeção inválido.');
  const value = input as Snapshot;
  if (!value.frozen) return value;
  if (!['frozen', 'frozen-conditional'].includes(value.status) || !value.generatedAt || !Number.isFinite(Date.parse(value.generatedAt)) || Date.parse(value.generatedAt) >= Date.parse(FREEZE_DEADLINE) || !value.projection || !value.sha256 || snapshotHash(value) !== value.sha256) throw new Error('Data ou hash do arquivo congelado inválidos. Não usar para comparação.');
  return value;
}

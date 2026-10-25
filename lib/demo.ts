import type { ConditionalInput, ControlDefaults } from './forecast';

export const stateInfo = [
  ['AC', 'Acre', 'Norte', 1, 4], ['AL', 'Alagoas', 'Nordeste', 7, 4],
  ['AP', 'Amapá', 'Norte', 4, 0], ['AM', 'Amazonas', 'Norte', 2, 2],
  ['BA', 'Bahia', 'Nordeste', 6, 4], ['CE', 'Ceará', 'Nordeste', 6, 2],
  ['DF', 'Distrito Federal', 'Centro-Oeste', 5, 5], ['ES', 'Espírito Santo', 'Sudeste', 7, 6],
  ['GO', 'Goiás', 'Centro-Oeste', 4, 5], ['MA', 'Maranhão', 'Nordeste', 5, 2],
  ['MT', 'Mato Grosso', 'Centro-Oeste', 3, 4], ['MS', 'Mato Grosso do Sul', 'Centro-Oeste', 3, 6],
  ['MG', 'Minas Gerais', 'Sudeste', 5, 6], ['PA', 'Pará', 'Norte', 4, 2],
  ['PB', 'Paraíba', 'Nordeste', 7, 3], ['PR', 'Paraná', 'Sul', 4, 7],
  ['PE', 'Pernambuco', 'Nordeste', 6, 3], ['PI', 'Piauí', 'Nordeste', 5, 3],
  ['RJ', 'Rio de Janeiro', 'Sudeste', 6, 7], ['RN', 'Rio Grande do Norte', 'Nordeste', 7, 2],
  ['RS', 'Rio Grande do Sul', 'Sul', 3, 9], ['RO', 'Rondônia', 'Norte', 2, 4],
  ['RR', 'Roraima', 'Norte', 2, 0], ['SC', 'Santa Catarina', 'Sul', 4, 8],
  ['SP', 'São Paulo', 'Sudeste', 4, 6], ['SE', 'Sergipe', 'Nordeste', 7, 5],
  ['TO', 'Tocantins', 'Norte', 4, 3], ['ZZ', 'Exterior', 'Exterior', 8, 9],
] as const;

export type ModelSide = { share: number; interval: [number, number]; winProbability: number };
export type Destination = 'flavio' | 'lula' | 'blank' | 'null' | 'abstention';
export type ModelSummary = { id?: string; electorate?: number; state?: string; region?: string; name?: string; flavio: ModelSide; lula: ModelSide; counts: Record<Destination, number>; countsInterval?: Record<Destination, [number, number]> };
export type SimulationResult = { scenario: 'synthetic' | 'conditional'; label: string; simulations: number; national: ModelSummary; states: ModelSummary[]; cities: ModelSummary[]; histogram: { margin: number; count: number }[]; audit: { drawsChecked: number; violations: number } };
export type ModelInput = ConditionalInput;
export type ModelFlow = { source: string; count: number; name?: string; role?: string; origin?: string; destinations: Record<Destination, number> };
export type ConditionalForecast = SimulationResult & { scenario: 'conditional'; publicationReady: false; generatedAt: string; sha256?: string; provenance: ModelInput['provenance']; pollAverage: { share: number; asOf: string; polls: number }; input?: ModelInput; assumptions: unknown; flows: ModelFlow[]; controlDefaults?: ControlDefaults };

export function formatName(value: string) {
  if (value !== value.toLocaleUpperCase('pt-BR')) return value;
  return value.toLocaleLowerCase('pt-BR').replace(/\p{L}+/gu, (word, offset: number) => offset > 0 && ['de', 'da', 'do', 'das', 'dos', 'e'].includes(word) ? word : word[0].toLocaleUpperCase('pt-BR') + word.slice(1));
}

export function makeSyntheticInput(transfer = 55, abstention = 22, uncertainty = 0.1) {
  return {
    scenario: 'synthetic', seed: 2026, simulations: 20000,
    uncertainty: { national: uncertainty, regional: uncertainty * .7, city: uncertainty * .5 },
    cities: stateInfo.map(([uf, , region], i) => {
      const f = Math.round(37000 + Math.sin(i * 1.6) * 12000);
      const l = 70000 - f;
      const a = abstention / 100;
      const retention = (1 - a) / .78;
      return {
        id: `synthetic-${uf}`, state: uf, region, electorate: 100000,
        groups: [
          { id: 'flavio', count: f, transfer: [.92 * .78 * retention, .04 * .78 * retention, .02 * .78 * retention, .02 * .78 * retention, a] },
          { id: 'lula', count: l, transfer: [.04 * .78 * retention, .92 * .78 * retention, .02 * .78 * retention, .02 * .78 * retention, a] },
          { id: 'outros', count: 10000, transfer: [transfer / 100 * .9 * (1 - a), (1 - transfer / 100) * .9 * (1 - a), .05 * (1 - a), .05 * (1 - a), a] },
          { id: 'brancos-nulos', count: 5000, transfer: [.25 * (1 - a), .25 * (1 - a), .25 * (1 - a), .25 * (1 - a), a] },
          { id: 'abstencao', count: 15000, transfer: [.1 * (1 - a), .1 * (1 - a), .1 * (1 - a), .1 * (1 - a), .6 + .4 * a] },
        ],
      };
    }),
  };
}

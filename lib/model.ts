/** Typed facade of the same ESM kernel served to the browser worker. */
import * as kernel from "../public/model-worker.js";

export type Destination = "flavio" | "lula" | "blank" | "null" | "abstention";
export type Transfer = [number, number, number, number, number];
export interface SourceGroup { id: string; count: number; transfer: Transfer }
export interface ModelCity { id: string; state: string; region: string; electorate: number; groups: SourceGroup[] }
export interface ConditionalProvenance {
  label: string;
  assumptionsVersion: string;
  sources: string[];
  limitations: string[];
}
export interface SimulationInput {
  scenario: "synthetic" | "conditional";
  provenance?: ConditionalProvenance;
  seed?: number;
  simulations?: number;
  cities: ModelCity[];
  targetShare?: number;
  uncertainty?: { national?: number; regional?: number; city?: number; turnout?: number; invalid?: number };
}
export interface CandidateSummary { share: number | null; interval: [number, number] | null; winProbability: number }
export interface Summary {
  id: string;
  flavio: CandidateSummary;
  lula: CandidateSummary;
  tieProbability: number;
  counts: Record<Destination, number>;
  countsInterval: Record<Destination, [number, number]>;
  countsIntervalResolution: number | "exact";
  electorate: number;
  intervalResolution: number | "exact";
}
export interface SimulationResult {
  scenario: "synthetic" | "conditional";
  label: string;
  provenance: ConditionalProvenance | null;
  publicationReady: false;
  coverageValidated: false;
  simulations: number;
  seed: number;
  uncertainty: Required<NonNullable<SimulationInput["uncertainty"]>> & { estimatedFromHistory: false };
  national: Summary;
  states: Summary[];
  cities: (Summary & { state: string; region: string })[];
  histogram: { margin: number; count: number }[];
  audit: { drawsChecked: number; violations: number; minCount: number; electorate: number; rounding: string; synthetic: boolean; conditional: boolean };
}
export interface Poll {
  registration: string;
  fieldEnd: string;
  sampleSize: number;
  denominator: "valid" | "total";
  flavioShare: number;
  verified: boolean;
  houseBias?: number;
  biasEvidence?: string;
}
export interface PollAverage {
  flavioShare: number | null;
  included: { registration: string; weight: number; adjustedShare: number; normalizedWeight: number }[];
  excluded: { registration: string | null; reason: string }[];
}
export const DESTINATIONS = kernel.DESTINATIONS as Destination[];
export const allocateIntegers = kernel.allocateIntegers as (total: number, weights: number[], tieSeed?: number) => number[];
export const calibrateShares: (shares: number[], weights: number[], target: number) => number[] = kernel.calibrateShares;
export const weightedPollAverage: (polls: Poll[], asOf: string, halfLifeDays?: number) => PollAverage = kernel.weightedPollAverage;
export const runSimulation = kernel.runSimulation as (input: SimulationInput, onProgress?: (progress: number) => void) => SimulationResult;

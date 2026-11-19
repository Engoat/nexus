/**
 * Simulation registry. Mirrors the algorithm registry: one line per simulation.
 */

import { queueSim } from './queueSim';
import type { SimulationSpec } from './types';

export const SIMULATIONS: readonly SimulationSpec<unknown>[] = [
  queueSim as SimulationSpec<unknown>,
];

export function simById(id: string): SimulationSpec<unknown> | undefined {
  return SIMULATIONS.find((s) => s.id === id);
}

export { queueSim };

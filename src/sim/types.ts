/**
 * Simulation contract.
 *
 * Mirrors the algorithm contract, minus the graph: a simulation takes only
 * parameters. It produces the same `Trace`, so the whole player, the pseudocode
 * panel, the structures, the invariants and the question mode work unchanged.
 */

import type { Issue, ParamSpec, ParamValues } from '../algorithms/types';
import type { InvariantSpec, Trace } from '../core/trace';

export interface SimulationSpec<R = unknown> {
  readonly id: string;
  readonly name: string;
  /** One sentence, shown in the picker. */
  readonly summary: string;
  /** What the model assumes, and why its results are what they are. */
  readonly rationale: string;
  readonly params: readonly ParamSpec[];
  readonly invariants: readonly InvariantSpec[];
  check(params: ParamValues): Issue[];
  run(params: ParamValues): Trace<R>;
}

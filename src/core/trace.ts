/**
 * Execution traces.
 *
 * An algorithm never animates anything. It emits a list of steps while it runs,
 * and the interface replays that list. A trace is plain serialisable data, so it
 * can be exported, diffed and asserted on in tests. That is what makes the
 * visualisation verifiable instead of decorative.
 *
 * A step carries three kinds of payload:
 *  - what happened (action, detail, marks, structures, metrics);
 *  - which invariants were checked at that point, and whether they held;
 *  - optionally, the question a learner can be asked before the step is shown.
 */

import type { EdgeId, NodeId } from './graph';

export type NodeMark =
  | 'idle'
  | 'source'
  | 'target'
  | 'current'
  | 'frontier'
  | 'settled'
  | 'excluded';

export type EdgeMark = 'idle' | 'inspected' | 'tree' | 'rejected' | 'path' | 'saturated';

/** A data structure as the analysis panel shows it. */
export type StructureView =
  | { kind: 'sequence'; name: string; semantics: 'queue' | 'stack' | 'list'; items: string[] }
  | { kind: 'set'; name: string; items: string[] }
  | { kind: 'heap'; name: string; items: { key: string; value: string }[] }
  | { kind: 'table'; name: string; columns: string[]; rows: (string | number)[][] };

/** An invariant as declared by an algorithm, before any run. */
export interface InvariantSpec {
  readonly id: string;
  /** The property, stated for a reader. */
  readonly statement: string;
  /** Why the algorithm would be wrong without it. */
  readonly matters: string;
}

/** One evaluation of an invariant, recorded while running. */
export interface InvariantCheck {
  readonly id: string;
  readonly holds: boolean;
  /** What was actually compared. Shown when the reader wants the numbers. */
  readonly detail?: string;
}

export type AskKind = 'node' | 'edge' | 'choice';

/**
 * A question the learner can answer before the step is revealed. The algorithm
 * supplies it while running, so the right answer is the decision the algorithm
 * actually took, never a guess reconstructed from the display.
 */
export interface Ask {
  readonly prompt: string;
  readonly kind: AskKind;
  /** Node id, edge id, or option value. */
  readonly answer: string;
  readonly among: readonly { value: string; label: string }[];
  /** The reason, revealed once the learner has answered. */
  readonly because: string;
}

export interface Step {
  /** 0-based position in the trace. */
  readonly index: number;
  /** Pseudocode line this step corresponds to, 1-based. 0 when none. */
  readonly line: number;
  /** Two or three words, shown in the step list. */
  readonly action: string;
  /** One sentence explaining the decision, in French. */
  readonly detail: string;
  readonly nodeMarks: Readonly<Record<NodeId, NodeMark>>;
  readonly edgeMarks: Readonly<Record<EdgeId, EdgeMark>>;
  readonly structures: readonly StructureView[];
  /** Counters shown live: visited nodes, relaxations, comparisons. */
  readonly metrics: Readonly<Record<string, number>>;
  /** Invariants evaluated at this point. Empty when none was due. */
  readonly invariants: readonly InvariantCheck[];
  readonly ask: Ask | null;
  /**
   * Optional bench-specific state, for a producer whose subject is not a graph.
   * The queue simulation puts its servers and its queue here, and only its own
   * renderer reads it. Must stay plain serialisable data.
   */
  readonly scene: unknown;
}

export interface Complexity {
  readonly time: string;
  readonly space: string;
  readonly note?: string;
}

export interface Trace<R = unknown> {
  readonly algorithmId: string;
  readonly pseudocode: readonly string[];
  readonly steps: readonly Step[];
  readonly result: R;
  readonly complexity: Complexity;
  /** Facts established by the run, phrased for a reader. */
  readonly conclusions: readonly string[];
  /** Invariants this algorithm claims to maintain. */
  readonly invariants: readonly InvariantSpec[];
}

/**
 * Accumulates steps. Marks are sticky: set a node to `settled` once and it stays
 * settled until changed, which keeps call sites short and avoids re-describing
 * the whole world at every step.
 */
export class Tracer {
  private readonly steps: Step[] = [];
  private readonly nodeMarks = new Map<NodeId, NodeMark>();
  private readonly edgeMarks = new Map<EdgeId, EdgeMark>();
  private readonly metrics = new Map<string, number>();
  private readonly declared: Map<string, InvariantSpec>;
  /** Evaluations and question waiting to be attached to the next step. */
  private pendingChecks: InvariantCheck[] = [];
  private pendingAsk: Ask | null = null;

  constructor(invariants: readonly InvariantSpec[] = []) {
    this.declared = new Map(invariants.map((i) => [i.id, i]));
  }

  markNode(id: NodeId, mark: NodeMark): void {
    this.nodeMarks.set(id, mark);
  }

  markEdge(id: EdgeId, mark: EdgeMark): void {
    this.edgeMarks.set(id, mark);
  }

  clearEdgeMark(id: EdgeId): void {
    this.edgeMarks.delete(id);
  }

  nodeMark(id: NodeId): NodeMark {
    return this.nodeMarks.get(id) ?? 'idle';
  }

  count(key: string, by = 1): void {
    this.metrics.set(key, (this.metrics.get(key) ?? 0) + by);
  }

  metric(key: string): number {
    return this.metrics.get(key) ?? 0;
  }

  /**
   * Records an invariant evaluation, attached to the next emitted step.
   * Throws on an undeclared id: an invariant nobody declared cannot be shown,
   * and a typo would silently disable the check.
   */
  hold(id: string, holds: boolean, detail?: string): void {
    if (!this.declared.has(id)) {
      throw new Error(`Tracer.hold: invariant non déclaré (${id})`);
    }
    this.pendingChecks.push(detail === undefined ? { id, holds } : { id, holds, detail });
  }

  /** Attaches a question to the next emitted step. */
  ask(ask: Ask): void {
    if (!ask.among.some((o) => o.value === ask.answer)) {
      throw new Error(`Tracer.ask: la réponse « ${ask.answer} » n'est pas dans les propositions`);
    }
    this.pendingAsk = ask;
  }

  emit(args: {
    line: number;
    action: string;
    detail: string;
    structures?: StructureView[];
    scene?: unknown;
  }): void {
    this.steps.push({
      index: this.steps.length,
      line: args.line,
      action: args.action,
      detail: args.detail,
      nodeMarks: Object.fromEntries(this.nodeMarks),
      edgeMarks: Object.fromEntries(this.edgeMarks),
      structures: args.structures ?? [],
      metrics: Object.fromEntries(this.metrics),
      invariants: this.pendingChecks,
      ask: this.pendingAsk,
      scene: args.scene ?? null,
    });
    this.pendingChecks = [];
    this.pendingAsk = null;
  }

  build<R>(args: {
    algorithmId: string;
    pseudocode: readonly string[];
    result: R;
    complexity: Complexity;
    conclusions: readonly string[];
  }): Trace<R> {
    return {
      algorithmId: args.algorithmId,
      pseudocode: args.pseudocode,
      steps: this.steps,
      result: args.result,
      complexity: args.complexity,
      conclusions: args.conclusions,
      invariants: [...this.declared.values()],
    };
  }
}

/** Formats a distance for a table cell. */
export function fmtDist(v: number): string {
  return Number.isFinite(v) ? String(v) : '∞';
}

/** Every invariant evaluation of a trace, flattened. Used by the UI and tests. */
export function invariantReport(trace: Trace): {
  spec: InvariantSpec;
  evaluations: number;
  violations: { step: number; detail?: string }[];
}[] {
  return trace.invariants.map((spec) => {
    let evaluations = 0;
    const violations: { step: number; detail?: string }[] = [];
    for (const step of trace.steps) {
      for (const check of step.invariants) {
        if (check.id !== spec.id) continue;
        evaluations += 1;
        if (!check.holds) {
          violations.push(
            check.detail === undefined
              ? { step: step.index }
              : { step: step.index, detail: check.detail },
          );
        }
      }
    }
    return { spec, evaluations, violations };
  });
}

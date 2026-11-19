/**
 * Algorithm contract.
 *
 * Every algorithm declares its parameters and its preconditions as data. The
 * settings panel is generated from that declaration, and preconditions are
 * checked before a run instead of being explained in a tooltip nobody reads.
 */

import type { MathGraph, NodeId } from '../core/graph';
import type { InvariantSpec, Trace } from '../core/trace';

export type ParamValue = string | number | boolean | null;
export type ParamValues = Readonly<Record<string, ParamValue>>;

export type ParamSpec =
  | { kind: 'node'; id: string; label: string; required: boolean; help?: string }
  | {
      kind: 'number';
      id: string;
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
      help?: string;
    }
  | { kind: 'boolean'; id: string; label: string; default: boolean; help?: string }
  | {
      kind: 'choice';
      id: string;
      label: string;
      options: readonly { value: string; label: string }[];
      default: string;
      help?: string;
    };

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  readonly level: IssueLevel;
  readonly message: string;
  /** What the user can do about it, when there is a clear move. */
  readonly fix?: string;
}

export type AlgorithmFamily = 'parcours' | 'plus courts chemins' | 'arbre couvrant' | 'ordre' | 'flot';

export interface AlgorithmSpec<R = unknown> {
  readonly id: string;
  readonly name: string;
  readonly family: AlgorithmFamily;
  /** One sentence, shown in the picker. */
  readonly summary: string;
  /** Why the algorithm is correct, in two or three sentences. */
  readonly rationale: string;
  readonly params: readonly ParamSpec[];
  /**
   * Properties the algorithm claims to maintain throughout a run. They are
   * evaluated against the real internal state while running, and a violation
   * is reported in the trace rather than swallowed.
   */
  readonly invariants: readonly InvariantSpec[];
  /** Preconditions. An `error` blocks the run, a `warning` does not. */
  check(graph: MathGraph, params: ParamValues): Issue[];
  run(graph: MathGraph, params: ParamValues): Trace<R>;
}

/* --------------------------- param helpers --------------------------- */

export function asNodeId(params: ParamValues, key: string): NodeId | null {
  const v = params[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function asNumber(params: ParamValues, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function asBoolean(params: ParamValues, key: string, fallback: boolean): boolean {
  const v = params[key];
  return typeof v === 'boolean' ? v : fallback;
}

export function asChoice(params: ParamValues, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

/** Shared precondition: the graph has nodes and the named node exists. */
export function requireNode(
  graph: MathGraph,
  params: ParamValues,
  key: string,
  label: string,
): Issue[] {
  const issues: Issue[] = [];
  // An empty graph is already reported by `requireNodes`. Repeating it here
  // would show the student the same reason twice.
  if (graph.nodes.length === 0) return issues;

  const id = asNodeId(params, key);
  if (!id) {
    issues.push({ level: 'error', message: `${label} non choisi.`, fix: 'Sélectionne un sommet.' });
  } else if (!graph.nodes.some((n) => n.id === id)) {
    issues.push({ level: 'error', message: `${label} introuvable dans le graphe.` });
  }
  return issues;
}

/** Works for anything that declares parameters: an algorithm or a simulation. */
/** Shared precondition: enough vertices to make the question meaningful. */
export function requireNodes(graph: MathGraph, min: number): Issue[] {
  if (graph.nodes.length >= min) return [];
  return [
    {
      level: 'error',
      message:
        graph.nodes.length === 0
          ? "Le graphe est vide : il n'y a rien à parcourir."
          : `Il faut au moins ${min} sommets, le graphe n'en a que ${graph.nodes.length}.`,
      fix: "Passe à l'outil « Sommet » et clique dans la zone de travail pour en ajouter.",
    },
  ];
}

/** Shared precondition: an edgeless graph runs, but teaches nothing. */
export function warnNoEdges(graph: MathGraph): Issue[] {
  if (graph.edges.length > 0) return [];
  return [
    {
      level: 'warning',
      message: "Le graphe n'a aucune arête : chaque sommet est isolé.",
      fix: "Avec l'outil « Arête », clique deux sommets pour les relier.",
    },
  ];
}

export function defaultParams(spec: {
  readonly params: readonly ParamSpec[];
}): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of spec.params) {
    switch (p.kind) {
      case 'node':
        out[p.id] = null;
        break;
      case 'number':
        out[p.id] = p.default;
        break;
      case 'boolean':
        out[p.id] = p.default;
        break;
      case 'choice':
        out[p.id] = p.default;
        break;
    }
  }
  return out;
}

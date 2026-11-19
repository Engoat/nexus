/**
 * Keeping work between visits, and sharing it by link.
 *
 * Two mechanisms, deliberately different:
 *
 *  - **local autosave**, so reloading the page does not throw away a graph. Best
 *    effort: a blocked storage must never break the application, so every access
 *    is guarded.
 *  - **a link**, so a teacher can send an exercise and thirty students open the
 *    same graph. The URL carries a compact encoding rather than the file format:
 *    identifiers are dropped and rebuilt on load, coordinates are rounded, and
 *    flags become a short string. A link has to stay pasteable.
 */

import { DEFAULT_FLAGS, type GraphDocument } from '../core/graph';
import { freeLabel, nextEdgeId, nextNodeId } from '../core/ids';

const LOCAL_KEY = 'nexus:doc:v1';
const COMPACT_VERSION = 1;

/* ------------------------------------------------------------------ local */

export function saveLocal(doc: GraphDocument): void {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(doc));
  } catch {
    // Private window, blocked storage, quota: losing the autosave is acceptable,
    // crashing is not.
  }
}

export function loadLocal(): GraphDocument | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GraphDocument;
    if (!Array.isArray(parsed?.nodes) || !Array.isArray(parsed?.edges)) return null;
    return { flags: { ...DEFAULT_FLAGS, ...parsed.flags }, nodes: parsed.nodes, edges: parsed.edges };
  } catch {
    return null;
  }
}

export function clearLocal(): void {
  try {
    window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* rien à faire */
  }
}

/* ------------------------------------------------------------------ link */

/**
 * Compact shape, kept short on purpose:
 *   v  version
 *   f  flags, one letter each: d orienté, w pondéré, l boucles, m multi
 *   n  [label, x, y]
 *   e  [fromIndex, toIndex, weight | null, capacity | null]
 */
interface Compact {
  readonly v: number;
  readonly f: string;
  readonly n: readonly [string, number, number][];
  readonly e: readonly [number, number, number | null, number | null][];
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = window.atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeDocument(doc: GraphDocument): string {
  const index = new Map(doc.nodes.map((n, i) => [n.id, i]));
  const compact: Compact = {
    v: COMPACT_VERSION,
    f:
      (doc.flags.directed ? 'd' : '') +
      (doc.flags.weighted ? 'w' : '') +
      (doc.flags.loops ? 'l' : '') +
      (doc.flags.multi ? 'm' : ''),
    n: doc.nodes.map((n) => [n.label, Math.round(n.x), Math.round(n.y)]),
    e: doc.edges.map((e) => [
      index.get(e.from) ?? 0,
      index.get(e.to) ?? 0,
      e.weight ?? null,
      e.capacity ?? null,
    ]),
  };
  return toBase64Url(JSON.stringify(compact));
}

/** Throws a readable error rather than returning a half-built graph. */
export function decodeDocument(encoded: string): GraphDocument {
  let compact: Compact;
  try {
    compact = JSON.parse(fromBase64Url(encoded)) as Compact;
  } catch {
    throw new Error('Lien illisible : le contenu après le # est abîmé.');
  }
  if (compact?.v !== COMPACT_VERSION) {
    throw new Error(`Lien produit par une autre version du format (${compact?.v ?? '?'}).`);
  }
  if (!Array.isArray(compact.n) || !Array.isArray(compact.e)) {
    throw new Error('Lien incomplet : sommets ou arêtes manquants.');
  }

  const flags = {
    ...DEFAULT_FLAGS,
    directed: compact.f.includes('d'),
    weighted: compact.f.includes('w'),
    loops: compact.f.includes('l'),
    multi: compact.f.includes('m'),
  };

  const taken: string[] = [];
  const nodes = compact.n.map(([label, x, y]) => {
    const safe = typeof label === 'string' && label.length > 0 ? label : freeLabel(taken);
    taken.push(safe);
    return {
      id: nextNodeId(),
      label: safe,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    };
  });

  const edges = compact.e
    .filter(([from, to]) => nodes[from] !== undefined && nodes[to] !== undefined)
    .map(([from, to, weight, capacity]) => ({
      id: nextEdgeId(),
      from: nodes[from].id,
      to: nodes[to].id,
      ...(weight === null || weight === undefined ? {} : { weight }),
      ...(capacity === null || capacity === undefined ? {} : { capacity }),
    }));

  return { flags, nodes, edges };
}

/** The shareable address of the current graph. */
export function linkFor(doc: GraphDocument): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#g=${encodeDocument(doc)}`;
}

/** Reads a graph out of the current address, when there is one. */
export function documentFromLocation(): GraphDocument | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#g=')) return null;
  return decodeDocument(hash.slice(3));
}

export function writeLocation(doc: GraphDocument): void {
  const encoded = encodeDocument(doc);
  // replaceState rather than assigning location.hash: no history entry per edit.
  window.history.replaceState(null, '', `#g=${encoded}`);
}

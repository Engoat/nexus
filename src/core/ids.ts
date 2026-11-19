/**
 * Stable identifier generation.
 *
 * Node labels are reused after a deletion (the alphabet is finite and a user
 * expects "A" to come back), but identifiers never are: a deleted node's id must
 * not be reattributed, or an exported trace would silently point at the wrong
 * node.
 */

let nodeSeq = 0;
let edgeSeq = 0;

export function nextNodeId(): string {
  nodeSeq += 1;
  return `n${nodeSeq}`;
}

export function nextEdgeId(): string {
  edgeSeq += 1;
  return `e${edgeSeq}`;
}

/** Re-seeds the counters above the ids already present, after an import. */
export function reseedFrom(ids: { nodes: readonly string[]; edges: readonly string[] }): void {
  const maxOf = (list: readonly string[], prefix: string) =>
    list.reduce((max, id) => {
      const m = new RegExp(`^${prefix}(\d+)$`).exec(id);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
  nodeSeq = Math.max(nodeSeq, maxOf(ids.nodes, 'n'));
  edgeSeq = Math.max(edgeSeq, maxOf(ids.edges, 'e'));
}

/** Spreadsheet-style labels: A…Z, then AA, AB… */
export function labelForIndex(i: number): string {
  let n = i;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** First label not already taken in the document. */
export function freeLabel(taken: readonly string[]): string {
  const used = new Set(taken);
  for (let i = 0; ; i += 1) {
    const candidate = labelForIndex(i);
    if (!used.has(candidate)) return candidate;
  }
}

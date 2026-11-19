/**
 * Disjoint set union with union by size and path compression.
 * Used by Kruskal to answer "would this edge close a cycle?" in near-constant
 * time, and to show the user how components merge.
 */

export class DisjointSet<T> {
  private parent = new Map<T, T>();
  private size = new Map<T, number>();

  constructor(items: Iterable<T>) {
    for (const it of items) {
      this.parent.set(it, it);
      this.size.set(it, 1);
    }
  }

  find(x: T): T {
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root) as T;
    }
    // path compression
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur) as T;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  connected(a: T, b: T): boolean {
    return this.find(a) === this.find(b);
  }

  /** Returns false when both items already shared a component. */
  union(a: T, b: T): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    const sa = this.size.get(ra) ?? 1;
    const sb = this.size.get(rb) ?? 1;
    const [big, small] = sa >= sb ? [ra, rb] : [rb, ra];
    this.parent.set(small, big);
    this.size.set(big, sa + sb);
    this.size.delete(small);
    return true;
  }

  get componentCount(): number {
    let n = 0;
    for (const [item, p] of this.parent) if (item === p) n += 1;
    return n;
  }

  /** Components as groups, each sorted, for display. */
  groups(): T[][] {
    const byRoot = new Map<T, T[]>();
    for (const item of this.parent.keys()) {
      const r = this.find(item);
      const list = byRoot.get(r);
      if (list) list.push(item);
      else byRoot.set(r, [item]);
    }
    return [...byRoot.values()];
  }
}

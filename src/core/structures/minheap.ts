/**
 * Binary min-heap with lazy decrease-key.
 *
 * Dijkstra and Prim push a new entry rather than updating one in place, then
 * skip entries that are stale when popped. This keeps the structure simple and
 * keeps the O((V+E) log V) bound, at the cost of holding at most E entries.
 */

export interface HeapEntry<T> {
  readonly key: number;
  readonly value: T;
  /** Insertion order, used to break ties so runs stay reproducible. */
  readonly seq: number;
}

export class MinHeap<T> {
  private heap: HeapEntry<T>[] = [];
  private seq = 0;

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  push(key: number, value: T): void {
    this.heap.push({ key, value, seq: this.seq++ });
    this.siftUp(this.heap.length - 1);
  }

  peek(): HeapEntry<T> | undefined {
    return this.heap[0];
  }

  pop(): HeapEntry<T> | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop() as HeapEntry<T>;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  /** Snapshot sorted by key, for display only. */
  entries(): HeapEntry<T>[] {
    return [...this.heap].sort((a, b) => (a.key !== b.key ? a.key - b.key : a.seq - b.seq));
  }

  private less(a: HeapEntry<T>, b: HeapEntry<T>): boolean {
    return a.key !== b.key ? a.key < b.key : a.seq < b.seq;
  }

  private siftUp(i: number): void {
    let idx = i;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (!this.less(this.heap[idx], this.heap[parent])) break;
      [this.heap[idx], this.heap[parent]] = [this.heap[parent], this.heap[idx]];
      idx = parent;
    }
  }

  private siftDown(i: number): void {
    let idx = i;
    const n = this.heap.length;
    for (;;) {
      const l = idx * 2 + 1;
      const r = l + 1;
      let best = idx;
      if (l < n && this.less(this.heap[l], this.heap[best])) best = l;
      if (r < n && this.less(this.heap[r], this.heap[best])) best = r;
      if (best === idx) break;
      [this.heap[idx], this.heap[best]] = [this.heap[best], this.heap[idx]];
      idx = best;
    }
  }
}

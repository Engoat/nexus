/**
 * Layout algorithms. They touch coordinates only, never the structure, which is
 * why they live in the app layer and not next to the graph algorithms.
 *
 * Every layout is deterministic: same graph in, same positions out. A layout
 * that jitters makes a trace impossible to compare with a screenshot.
 */

import type { GraphDocument, NodeId } from '../core/graph';

export type LayoutKind = 'circle' | 'grid' | 'force' | 'layers';

export const LAYOUT_LABELS: Record<LayoutKind, string> = {
  circle: 'Cercle',
  grid: 'Grille',
  force: 'Ressorts',
  layers: 'Niveaux',
};

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export function applyLayout(
  doc: GraphDocument,
  kind: LayoutKind,
  view: Viewport,
): GraphDocument {
  switch (kind) {
    case 'circle':
      return circle(doc, view);
    case 'grid':
      return grid(doc, view);
    case 'force':
      return force(doc, view);
    case 'layers':
      return layers(doc, view);
  }
}

function circle(doc: GraphDocument, view: Viewport): GraphDocument {
  const n = doc.nodes.length;
  if (n === 0) return doc;
  const cx = view.width / 2;
  const cy = view.height / 2;
  const r = Math.max(90, Math.min(view.width, view.height) / 2 - 90);
  return {
    ...doc,
    nodes: doc.nodes.map((node, i) => {
      // Start at the top and turn clockwise, which matches how people read.
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return { ...node, x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
    }),
  };
}

function grid(doc: GraphDocument, view: Viewport): GraphDocument {
  const n = doc.nodes.length;
  if (n === 0) return doc;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const stepX = view.width / (cols + 1);
  const stepY = view.height / (rows + 1);
  return {
    ...doc,
    nodes: doc.nodes.map((node, i) => ({
      ...node,
      x: Math.round(stepX * (1 + (i % cols))),
      y: Math.round(stepY * (1 + Math.floor(i / cols))),
    })),
  };
}

/**
 * Spring embedder (Fruchterman-Reingold, simplified). Seeded from the circle
 * layout rather than from random positions so the result is reproducible.
 */
function force(doc: GraphDocument, view: Viewport): GraphDocument {
  const n = doc.nodes.length;
  if (n < 2) return circle(doc, view);

  const seeded = circle(doc, view);
  const pos = new Map<NodeId, { x: number; y: number }>();
  for (const node of seeded.nodes) pos.set(node.id, { x: node.x, y: node.y });

  const area = view.width * view.height;
  const k = Math.sqrt(area / n) * 0.62;
  const iterations = 260;

  const neighbours = new Map<NodeId, NodeId[]>();
  for (const node of doc.nodes) neighbours.set(node.id, []);
  for (const e of doc.edges) {
    if (e.from === e.to) continue;
    neighbours.get(e.from)?.push(e.to);
    neighbours.get(e.to)?.push(e.from);
  }

  for (let step = 0; step < iterations; step += 1) {
    const temperature = (1 - step / iterations) * (Math.min(view.width, view.height) / 12);
    const disp = new Map<NodeId, { x: number; y: number }>();
    for (const node of doc.nodes) disp.set(node.id, { x: 0, y: 0 });

    // Repulsion between every pair.
    for (let i = 0; i < doc.nodes.length; i += 1) {
      for (let j = i + 1; j < doc.nodes.length; j += 1) {
        const a = doc.nodes[i].id;
        const b = doc.nodes[j].id;
        const pa = pos.get(a) as { x: number; y: number };
        const pb = pos.get(b) as { x: number; y: number };
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) {
          // Deterministic nudge instead of a random one.
          dx = ((i % 3) - 1) * 0.5 + 0.01;
          dy = ((j % 3) - 1) * 0.5 + 0.01;
          d = Math.hypot(dx, dy);
        }
        const f = (k * k) / d;
        const da = disp.get(a) as { x: number; y: number };
        const db = disp.get(b) as { x: number; y: number };
        da.x += (dx / d) * f;
        da.y += (dy / d) * f;
        db.x -= (dx / d) * f;
        db.y -= (dy / d) * f;
      }
    }

    // Attraction along edges.
    for (const e of doc.edges) {
      if (e.from === e.to) continue;
      const pa = pos.get(e.from) as { x: number; y: number };
      const pb = pos.get(e.to) as { x: number; y: number };
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const f = (d * d) / k;
      const da = disp.get(e.from) as { x: number; y: number };
      const db = disp.get(e.to) as { x: number; y: number };
      da.x -= (dx / d) * f;
      da.y -= (dy / d) * f;
      db.x += (dx / d) * f;
      db.y += (dy / d) * f;
    }

    for (const node of doc.nodes) {
      const p = pos.get(node.id) as { x: number; y: number };
      const d = disp.get(node.id) as { x: number; y: number };
      const len = Math.max(0.01, Math.hypot(d.x, d.y));
      p.x += (d.x / len) * Math.min(len, temperature);
      p.y += (d.y / len) * Math.min(len, temperature);
      p.x = Math.min(view.width - 60, Math.max(60, p.x));
      p.y = Math.min(view.height - 60, Math.max(60, p.y));
    }
  }

  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      const p = pos.get(node.id) as { x: number; y: number };
      return { ...node, x: Math.round(p.x), y: Math.round(p.y) };
    }),
  };
}

/**
 * Layered layout by longest path from a source with no incoming edge. Useful on
 * directed acyclic graphs, where it makes the topological order visible.
 */
function layers(doc: GraphDocument, view: Viewport): GraphDocument {
  if (doc.nodes.length === 0) return doc;

  const indeg = new Map<NodeId, number>();
  for (const node of doc.nodes) indeg.set(node.id, 0);
  for (const e of doc.edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);

  const level = new Map<NodeId, number>();
  let ready = doc.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of ready) level.set(id, 0);

  const remaining = new Map(indeg);
  while (ready.length > 0) {
    const next: NodeId[] = [];
    for (const u of ready) {
      for (const e of doc.edges) {
        if (e.from !== u) continue;
        const left = (remaining.get(e.to) ?? 0) - 1;
        remaining.set(e.to, left);
        level.set(e.to, Math.max(level.get(e.to) ?? 0, (level.get(u) ?? 0) + 1));
        if (left === 0) next.push(e.to);
      }
    }
    ready = next;
  }

  // Nodes inside a cycle never get a level: park them on a last column.
  const maxLevel = Math.max(0, ...[...level.values()]);
  for (const node of doc.nodes) {
    if (!level.has(node.id)) level.set(node.id, maxLevel + 1);
  }

  const columns = new Map<number, NodeId[]>();
  for (const node of doc.nodes) {
    const l = level.get(node.id) as number;
    const list = columns.get(l);
    if (list) list.push(node.id);
    else columns.set(l, [node.id]);
  }

  const count = columns.size;
  const stepX = view.width / (count + 1);
  const place = new Map<NodeId, { x: number; y: number }>();
  [...columns.keys()]
    .sort((a, b) => a - b)
    .forEach((l, columnIndex) => {
      const ids = columns.get(l) as NodeId[];
      const stepY = view.height / (ids.length + 1);
      ids.forEach((id, row) => {
        place.set(id, {
          x: Math.round(stepX * (columnIndex + 1)),
          y: Math.round(stepY * (row + 1)),
        });
      });
    });

  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      const p = place.get(node.id) as { x: number; y: number };
      return { ...node, x: p.x, y: p.y };
    }),
  };
}

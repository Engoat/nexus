/**
 * The graph surface: render, pan, zoom, create, move, select, delete.
 *
 * Coordinates live in a "world" space stored on the document. The SVG viewBox
 * maps that world to the screen, so zooming never rewrites node positions.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { EdgeId, GraphEdge, NodeId } from '../../core/graph';
import { addEdge, addNode, removeEdge, removeNode } from '../../core/graph';
import { freeLabel, nextEdgeId, nextNodeId } from '../../core/ids';
import type { EdgeMark, NodeMark } from '../../core/trace';
import type { DocumentStore } from '../state/useDocument';

export type Mode = 'select' | 'node' | 'edge' | 'erase';

export interface Selection {
  readonly kind: 'node' | 'edge';
  readonly id: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const NODE_R = 19;
const MIN_W = 180;
const MAX_W = 4200;

/**
 * A pending question answerable on the canvas. Only the candidates react, so a
 * click cannot produce an answer the algorithm never offered.
 */
export interface CanvasQuiz {
  readonly kind: 'node' | 'edge';
  readonly candidates: readonly string[];
  onAnswer(value: string): void;
}

/** Imperative handle, so the toolbar can frame and zoom the view. */
export interface CanvasApi {
  fit(): void;
  zoomIn(): void;
  zoomOut(): void;
}

interface Props {
  readonly store: DocumentStore;
  readonly mode: Mode;
  readonly nodeMarks: Readonly<Record<NodeId, NodeMark>>;
  readonly edgeMarks: Readonly<Record<EdgeId, EdgeMark>>;
  readonly selection: Selection | null;
  onSelect(selection: Selection | null): void;
  /** Called after any structural edit, so a stale trace can be dropped. */
  onEdit(): void;
  /** Node ids flagged as source / sink by the current parameters. */
  readonly roles: Readonly<Record<NodeId, string>>;
  /** Set while a question waits for an answer. Editing is suspended. */
  readonly quiz?: CanvasQuiz | null;
  /** Read-only pane: no editing, no selection, used by the comparison view. */
  readonly readOnly?: boolean;
}

export const GraphCanvas = forwardRef<CanvasApi, Props>(function GraphCanvas(props, ref) {
  const {
    store,
    mode,
    nodeMarks,
    edgeMarks,
    selection,
    onSelect,
    onEdit,
    roles,
    quiz = null,
    readOnly = false,
  } = props;
  const doc = store.doc;
  const answering = quiz !== null;
  const isCandidate = (value: string) => quiz?.candidates.includes(value) ?? false;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 960, h: 620 });
  const [dragNode, setDragNode] = useState<NodeId | null>(null);
  const [panning, setPanning] = useState(false);
  const [linkFrom, setLinkFrom] = useState<NodeId | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const panOrigin = useRef<{ x: number; y: number; box: Box } | null>(null);

  /* ------------------------------------------------ world coordinates */

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: box.x + ((clientX - rect.left) / rect.width) * box.w,
        y: box.y + ((clientY - rect.top) / rect.height) * box.h,
      };
    },
    [box],
  );

  /** Frames the whole graph, with a margin. */
  const fit = useCallback(() => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    const ratio = rect && rect.height > 0 ? rect.width / rect.height : 1.55;

    if (doc.nodes.length === 0) {
      setBox({ x: 0, y: 0, w: 960, h: Math.round(960 / ratio) });
      return;
    }
    const xs = doc.nodes.map((n) => n.x);
    const ys = doc.nodes.map((n) => n.y);
    const pad = 90;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    let w = Math.max(MIN_W, maxX - minX);
    let h = Math.max(MIN_W / ratio, maxY - minY);
    // Keep the aspect ratio of the viewport so circles stay circles.
    if (w / h < ratio) w = h * ratio;
    else h = w / ratio;
    setBox({
      x: (minX + maxX) / 2 - w / 2,
      y: (minY + maxY) / 2 - h / 2,
      w,
      h,
    });
  }, [doc.nodes]);

  // First paint: frame whatever the initial document holds.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current || doc.nodes.length === 0) return;
    booted.current = true;
    fit();
  }, [doc.nodes.length, fit]);

  const zoomBy = useCallback((factor: number, centre?: { x: number; y: number }) => {
    setBox((b) => {
      const w = Math.min(MAX_W, Math.max(MIN_W, b.w * factor));
      const h = (w / b.w) * b.h;
      const cx = centre?.x ?? b.x + b.w / 2;
      const cy = centre?.y ?? b.y + b.h / 2;
      // Keep the point under the cursor fixed.
      const k = w / b.w;
      return { x: cx - (cx - b.x) * k, y: cy - (cy - b.y) * k, w, h };
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fit,
      zoomIn: () => zoomBy(1 / 1.25),
      zoomOut: () => zoomBy(1.25),
    }),
    [fit, zoomBy],
  );

  /* ------------------------------------------------ editing */

  const createNode = useCallback(
    (at: { x: number; y: number }) => {
      const id = nextNodeId();
      const label = freeLabel(doc.nodes.map((n) => n.label));
      store.commit(
        (prev) => addNode(prev, { id, label, x: Math.round(at.x), y: Math.round(at.y) }),
        `Sommet ${label} ajouté`,
      );
      onEdit();
      onSelect({ kind: 'node', id });
    },
    [doc.nodes, store, onEdit, onSelect],
  );

  const createEdge = useCallback(
    (from: NodeId, to: NodeId) => {
      const id = nextEdgeId();
      const edge: GraphEdge = {
        id,
        from,
        to,
        ...(doc.flags.weighted ? { weight: 1 } : {}),
        ...(doc.edges.some((e) => e.capacity !== undefined) ? { capacity: 1 } : {}),
      };
      try {
        store.commit((prev) => addEdge(prev, edge), 'Arête ajoutée');
        onEdit();
        onSelect({ kind: 'edge', id });
      } catch (e) {
        // Model rules (loops, parallel edges) are enforced in the core; surface
        // the refusal instead of silently dropping the gesture.
        window.alert(e instanceof Error ? e.message : String(e));
      }
    },
    [doc.flags.weighted, doc.edges, store, onEdit, onSelect],
  );

  const erase = useCallback(
    (target: Selection) => {
      if (target.kind === 'node') {
        const node = doc.nodes.find((n) => n.id === target.id);
        store.commit((prev) => removeNode(prev, target.id), `Sommet ${node?.label ?? ''} supprimé`);
      } else {
        store.commit((prev) => removeEdge(prev, target.id), 'Arête supprimée');
      }
      onEdit();
      onSelect(null);
    },
    [doc.nodes, store, onEdit, onSelect],
  );

  /* ------------------------------------------------ pointer handling */

  const onBackgroundDown = (e: React.PointerEvent<SVGRectElement>) => {
    const at = toWorld(e.clientX, e.clientY);
    if (readOnly) return;
    if (answering) {
      // Panning stays available; creating would edit the graph mid-question.
      setPanning(true);
      panOrigin.current = { x: e.clientX, y: e.clientY, box };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (mode === 'node') {
      createNode(at);
      return;
    }
    if (mode === 'edge' && linkFrom) {
      setLinkFrom(null);
      return;
    }
    if (mode === 'select' || mode === 'edge' || mode === 'erase') {
      onSelect(null);
      setPanning(true);
      panOrigin.current = { x: e.clientX, y: e.clientY, box };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };

  const onNodeDown = (e: React.PointerEvent<SVGGElement>, id: NodeId) => {
    e.stopPropagation();
    if (readOnly) return;
    if (quiz) {
      if (quiz.kind === 'node' && isCandidate(id)) quiz.onAnswer(id);
      return;
    }
    if (mode === 'erase') {
      erase({ kind: 'node', id });
      return;
    }
    if (mode === 'edge') {
      if (linkFrom === null) {
        setLinkFrom(id);
        onSelect({ kind: 'node', id });
      } else {
        createEdge(linkFrom, id);
        setLinkFrom(null);
      }
      return;
    }
    onSelect({ kind: 'node', id });
    setDragNode(id);
    store.beginGesture();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const at = toWorld(e.clientX, e.clientY);
    if (mode === 'edge' && linkFrom) setPointer(at);

    if (dragNode) {
      store.touch((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === dragNode ? { ...n, x: Math.round(at.x), y: Math.round(at.y) } : n,
        ),
      }));
      return;
    }

    if (panning && panOrigin.current) {
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      if (!rect) return;
      const origin = panOrigin.current;
      const dx = ((e.clientX - origin.x) / rect.width) * origin.box.w;
      const dy = ((e.clientY - origin.y) / rect.height) * origin.box.h;
      setBox({ ...origin.box, x: origin.box.x - dx, y: origin.box.y - dy });
    }
  };

  const onUp = () => {
    if (dragNode) {
      store.endGesture();
      setDragNode(null);
    }
    setPanning(false);
    panOrigin.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? 1.12 : 0.89, toWorld(e.clientX, e.clientY));
  };

  // Escape cancels an edge in progress; Delete removes the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') setLinkFrom(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection && !answering && !readOnly) {
        e.preventDefault();
        erase(selection);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, erase, answering, readOnly]);

  useEffect(() => {
    if (mode !== 'edge') setLinkFrom(null);
  }, [mode]);

  /**
   * Arrow keys walk the graph from neighbour to neighbour, in the direction
   * asked for. Tabbing through every node in document order tells you nothing
   * about the structure; following an edge does.
   */
  const moveFocus = useCallback(
    (from: NodeId, key: string) => {
      const here = doc.nodes.find((n) => n.id === from);
      if (!here) return;

      const wanted =
        key === 'ArrowRight'
          ? { x: 1, y: 0 }
          : key === 'ArrowLeft'
            ? { x: -1, y: 0 }
            : key === 'ArrowDown'
              ? { x: 0, y: 1 }
              : { x: 0, y: -1 };

      const neighbours = doc.edges
        .flatMap((e) => {
          if (e.from === from) return [e.to];
          if (e.to === from && !doc.flags.directed) return [e.from];
          return [];
        })
        .map((id) => doc.nodes.find((n) => n.id === id))
        .filter((n): n is NonNullable<typeof n> => n !== undefined);

      let best: { id: NodeId; score: number } | null = null;
      for (const candidate of neighbours) {
        const dx = candidate.x - here.x;
        const dy = candidate.y - here.y;
        const length = Math.hypot(dx, dy) || 1;
        // Projection on the wanted direction: positive means "that way".
        const alignment = (dx / length) * wanted.x + (dy / length) * wanted.y;
        if (alignment <= 0.25) continue;
        const score = alignment - length / 100000;
        if (!best || score > best.score) best = { id: candidate.id, score };
      }
      if (!best) return;

      const target = svgRef.current?.querySelector<SVGGElement>(`[data-node="${best.id}"]`);
      target?.focus();
      onSelect({ kind: 'node', id: best.id });
    },
    [doc, onSelect],
  );

  /* ------------------------------------------------ geometry */

  const nodeIndex = useMemo(() => {
    const map = new Map<NodeId, { x: number; y: number; label: string }>();
    for (const n of doc.nodes) map.set(n.id, { x: n.x, y: n.y, label: n.label });
    return map;
  }, [doc.nodes]);

  /** True when the opposite arc also exists: both get curved apart. */
  const twinned = useMemo(() => {
    const set = new Set<EdgeId>();
    if (!doc.flags.directed) return set;
    for (const a of doc.edges) {
      for (const b of doc.edges) {
        if (a.id !== b.id && a.from === b.to && a.to === b.from) {
          set.add(a.id);
          set.add(b.id);
        }
      }
    }
    return set;
  }, [doc.edges, doc.flags.directed]);

  const geometryOf = (edge: GraphEdge) => {
    const a = nodeIndex.get(edge.from);
    const b = nodeIndex.get(edge.to);
    if (!a || !b) return null;

    if (edge.from === edge.to) {
      // Self loop: arc above the node.
      const r = 26;
      return {
        path: `M ${a.x - 8} ${a.y - NODE_R + 2} A ${r} ${r} 0 1 1 ${a.x + 8} ${a.y - NODE_R + 2}`,
        label: { x: a.x, y: a.y - NODE_R - 2 * r + 6 },
        tip: null as null | { x: number; y: number; angle: number },
      };
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const bend = twinned.has(edge.id) ? 26 : 0;

    const sx = a.x + ux * NODE_R;
    const sy = a.y + uy * NODE_R;
    const ex = b.x - ux * (NODE_R + (doc.flags.directed ? 7 : 0));
    const ey = b.y - uy * (NODE_R + (doc.flags.directed ? 7 : 0));

    if (bend === 0) {
      return {
        path: `M ${sx} ${sy} L ${ex} ${ey}`,
        label: { x: (sx + ex) / 2, y: (sy + ey) / 2 - 6 },
        tip: { x: ex, y: ey, angle: (Math.atan2(dy, dx) * 180) / Math.PI },
      };
    }

    // Quadratic control point pushed to the left of the direction of travel.
    const mx = (sx + ex) / 2 - uy * bend;
    const my = (sy + ey) / 2 + ux * bend;
    // Tangent at the end point of a quadratic curve points from control to end.
    const angle = (Math.atan2(ey - my, ex - mx) * 180) / Math.PI;
    return {
      path: `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`,
      label: { x: (sx + ex) / 2 - uy * bend * 0.62, y: (sy + ey) / 2 + ux * bend * 0.62 - 4 },
      tip: { x: ex, y: ey, angle },
    };
  };

  const edgeText = (edge: GraphEdge): string | null => {
    const parts: string[] = [];
    if (doc.flags.weighted && edge.weight !== undefined) parts.push(String(edge.weight));
    if (edge.capacity !== undefined) parts.push(`c${edge.capacity}`);
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  // La réglure appartient à la page : elle est en unités du monde, donc elle se
  // déplace et se met à l'échelle avec le graphe. On change de pas quand on
  // dézoome, sinon les lignes deviennent plus fines qu'un pixel.
  const ruling = box.w > 2600 ? 128 : box.w > 1400 ? 64 : 32;
  const interline = ruling / 4;
  const hair = (ruling / 32) * 0.8;

  const className = [
    'canvas',
    answering ? 'canvas--answering' : '',
    readOnly ? 'canvas--readonly' : '',
    !answering && !readOnly && mode === 'node' ? 'canvas--add-node' : '',
    !answering && !readOnly && mode === 'edge' ? 'canvas--add-edge' : '',
    !answering && !readOnly && mode === 'erase' ? 'canvas--erase' : '',
    panning ? 'canvas--panning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onWheel={onWheel}
      role="application"
      aria-label="Zone de travail du graphe"
    >
      <defs>
        <pattern
          id="seyes"
          x={0}
          y={0}
          width={ruling}
          height={ruling}
          patternUnits="userSpaceOnUse"
        >
          <rect width={ruling} height={ruling} fill="var(--paper)" />
          {[1, 2, 3].map((i) => (
            <line
              key={i}
              x1={0}
              y1={interline * i}
              x2={ruling}
              y2={interline * i}
              stroke="var(--seyes-soft)"
              strokeWidth={hair}
            />
          ))}
          <line
            x1={0}
            y1={hair / 2}
            x2={ruling}
            y2={hair / 2}
            stroke="var(--seyes)"
            strokeWidth={hair * 1.5}
          />
          <line
            x1={hair / 2}
            y1={0}
            x2={hair / 2}
            y2={ruling}
            stroke="var(--seyes-soft)"
            strokeWidth={hair}
          />
        </pattern>
        <marker
          id="tip"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--pencil)" />
        </marker>
      </defs>

      {/* la page elle-même : c'est elle qui reçoit les clics dans le vide */}
      <rect
        className="canvas__page"
        x={box.x - 4000}
        y={box.y - 4000}
        width={box.w + 8000}
        height={box.h + 8000}
        fill="url(#seyes)"
        onPointerDown={onBackgroundDown}
      />

      {/* edges first: nodes must sit above them */}
      <g>
        {doc.edges.map((edge) => {
          const geo = geometryOf(edge);
          if (!geo) return null;
          const mark = edgeMarks[edge.id] ?? 'idle';
          const selected = selection?.kind === 'edge' && selection.id === edge.id;
          const text = edgeText(edge);
          return (
            <g key={edge.id}>
              <path
                className="edge-hit"
                d={geo.path}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (readOnly) return;
                  if (quiz) {
                    if (quiz.kind === 'edge' && isCandidate(edge.id)) quiz.onAnswer(edge.id);
                    return;
                  }
                  if (mode === 'erase') erase({ kind: 'edge', id: edge.id });
                  else onSelect({ kind: 'edge', id: edge.id });
                }}
              />
              {mark === 'path' ? <path className="edge-ghost" d={geo.path} /> : null}
              <path
                className="edge-line"
                d={geo.path}
                data-mark={mark}
                data-selected={selected}
                data-candidate={quiz?.kind === 'edge' ? isCandidate(edge.id) : undefined}
                markerEnd={doc.flags.directed ? 'url(#tip)' : undefined}
              />
              {geo.tip && doc.flags.directed ? (
                <path
                  d="M 0 -4 L 8 0 L 0 4 z"
                  transform={`translate(${geo.tip.x} ${geo.tip.y}) rotate(${geo.tip.angle})`}
                  fill={
                    mark === 'idle'
                      ? 'var(--pencil)'
                      : mark === 'tree'
                        ? 'var(--st-tree)'
                        : mark === 'path'
                          ? 'var(--st-path)'
                          : mark === 'saturated'
                            ? 'var(--st-saturated)'
                            : mark === 'rejected'
                              ? 'var(--pencil-soft)'
                              : 'var(--st-current)'
                  }
                />
              ) : null}
              {text ? (
                <text className="edge-label" x={geo.label.x} y={geo.label.y} textAnchor="middle">
                  {text}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>

      {/* edge in progress */}
      {linkFrom && pointer
        ? (() => {
            const a = nodeIndex.get(linkFrom);
            if (!a) return null;
            return (
              <path className="link-preview" d={`M ${a.x} ${a.y} L ${pointer.x} ${pointer.y}`} />
            );
          })()
        : null}

      <g>
        {doc.nodes.map((node) => {
          const mark = nodeMarks[node.id] ?? 'idle';
          const selected = selection?.kind === 'node' && selection.id === node.id;
          const role = roles[node.id];
          return (
            <g
              key={node.id}
              data-node={node.id}
              className={`node${dragNode === node.id ? ' node--dragging' : ''}`}
              data-mark={mark}
              data-selected={selected}
              data-candidate={quiz?.kind === 'node' ? isCandidate(node.id) : undefined}
              onPointerDown={(e) => onNodeDown(e, node.id)}
              tabIndex={0}
              role="button"
              aria-label={`Sommet ${node.label}${role ? `, ${role}` : ''}`}
              onKeyDown={(e) => {
                if (e.key.startsWith('Arrow')) {
                  e.preventDefault();
                  moveFocus(node.id, e.key);
                  return;
                }
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                if (readOnly) return;
                if (quiz?.kind === 'node' && isCandidate(node.id)) {
                  quiz.onAnswer(node.id);
                  return;
                }
                if (!quiz) onSelect({ kind: 'node', id: node.id });
              }}
            >
              <circle className="node__halo" cx={node.x} cy={node.y} r={NODE_R + 6} />
              <circle className="node__disc" cx={node.x} cy={node.y} r={NODE_R} />
              {role ? <circle className="node__ring" cx={node.x} cy={node.y} r={NODE_R + 3.5} /> : null}
              <text className="node__label" x={node.x} y={node.y}>
                {node.label}
              </text>
              {role ? (
                <text className="node__badge" x={node.x} y={node.y + NODE_R + 14}>
                  {role}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>

    </svg>
  );
});

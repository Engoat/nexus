/**
 * Left rail: everything that acts on the graph itself.
 * Tools, graph properties, layout, and the inspector for the current selection.
 */

import type { GraphDocument } from '../../core/graph';
import { removeEdge, removeNode, setFlags, updateEdge, updateNode } from '../../core/graph';
import { LAYOUT_LABELS, type LayoutKind } from '../layouts';
import type { DocumentStore } from '../state/useDocument';
import type { Mode, Selection } from './GraphCanvas';

const MODES: { id: Mode; label: string; key: string; hint: string }[] = [
  { id: 'select', label: 'Déplacer', key: 'V', hint: 'Sélectionner et déplacer les sommets.' },
  { id: 'node', label: 'Sommet', key: 'N', hint: 'Cliquer dans le vide pour créer un sommet.' },
  { id: 'edge', label: 'Arête', key: 'E', hint: 'Cliquer deux sommets pour les relier.' },
  { id: 'erase', label: 'Effacer', key: 'X', hint: 'Cliquer un sommet ou une arête pour la retirer.' },
];

interface Props {
  readonly store: DocumentStore;
  readonly mode: Mode;
  onMode(mode: Mode): void;
  readonly selection: Selection | null;
  onSelect(selection: Selection | null): void;
  readonly layout: LayoutKind;
  onLayout(kind: LayoutKind): void;
  onEdit(): void;
}

/** Undo and redo belong next to the tools that produce the edits. */
function History({ store }: { readonly store: DocumentStore }) {
  return (
    <div className="btn-row" style={{ marginTop: 'var(--sp3)' }}>
      <button
        type="button"
        className="btn"
        style={{ flex: 1 }}
        onClick={store.undo}
        disabled={!store.canUndo}
        aria-label="Annuler"
        title={
          store.canUndo
            ? store.lastLabel
              ? `Annuler — ${store.lastLabel}`
              : 'Annuler la dernière modification (Ctrl+Z)'
            : 'Rien à annuler pour le moment'
        }
      >
        <span aria-hidden="true">↶</span> Annuler
      </button>
      <button
        type="button"
        className="btn"
        style={{ flex: 1 }}
        onClick={store.redo}
        disabled={!store.canRedo}
        aria-label="Rétablir"
        title={store.canRedo ? 'Rétablir (Ctrl+Maj+Z)' : 'Rien à rétablir'}
      >
        <span aria-hidden="true">↷</span> Rétablir
      </button>
    </div>
  );
}

export function EditorPanel(props: Props) {
  const { store, mode, onMode, selection, onSelect, layout, onLayout, onEdit } = props;
  const doc = store.doc;

  const flag = (key: keyof GraphDocument['flags'], label: string, help?: string) => (
    <div className="field" key={key}>
      <label className="check">
        <input
          type="checkbox"
          checked={doc.flags[key]}
          onChange={(e) => {
            store.commit((prev) => setFlags(prev, { [key]: e.target.checked }), label);
            onEdit();
          }}
        />
        {label}
      </label>
      {help ? <span className="field__help">{help}</span> : null}
    </div>
  );

  return (
    <>
      <section className="block">
        <h2 className="block__title">Outils</h2>
        <div className="tools" role="group" aria-label="Outils d'édition">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="tool"
              aria-pressed={mode === m.id}
              onClick={() => onMode(m.id)}
              title={m.hint}
              /* le badge de raccourci ne doit pas entrer dans le nom accessible */
              aria-label={m.label}
              aria-keyshortcuts={m.key}
            >
              {m.label}
              <kbd aria-hidden="true">{m.key}</kbd>
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 'var(--sp3)' }}>
          {MODES.find((m) => m.id === mode)?.hint}
        </p>
        <History store={store} />
      </section>

      <section className="block">
        <h2 className="block__title">
          Graphe
          <span className="count">
            {doc.nodes.length} sommets · {doc.edges.length} arêtes
          </span>
        </h2>
        {flag('directed', 'Orienté', 'Chaque arête ne se parcourt que dans un sens.')}
        {flag('weighted', 'Pondéré', 'Les arêtes portent un poids, sinon chacune compte 1.')}
        {flag('loops', 'Boucles autorisées')}
        {flag('multi', 'Arêtes parallèles autorisées')}

        <div className="field" style={{ marginTop: 'var(--sp4)' }}>
          <label htmlFor="layout">Disposition</label>
          <select
            id="layout"
            className="control"
            value={layout}
            onChange={(e) => onLayout(e.target.value as LayoutKind)}
          >
            {(Object.keys(LAYOUT_LABELS) as LayoutKind[]).map((k) => (
              <option key={k} value={k}>
                {LAYOUT_LABELS[k]}
              </option>
            ))}
          </select>
          <span className="field__help">
            Ne change que les positions. La structure du graphe reste intacte.
          </span>
        </div>
      </section>

      <section className="block">
        <h2 className="block__title">Sélection</h2>
        {!selection ? (
          <p className="hint">
            Clique un sommet ou une arête pour en modifier les propriétés.
          </p>
        ) : selection.kind === 'node' ? (
          <NodeInspector
            store={store}
            id={selection.id}
            onEdit={onEdit}
            onDeselect={() => onSelect(null)}
          />
        ) : (
          <EdgeInspector
            store={store}
            id={selection.id}
            onEdit={onEdit}
            onDeselect={() => onSelect(null)}
          />
        )}
      </section>

      <section className="block">
        <h2 className="block__title">Raccourcis</h2>
        <div className="kbd-list">
          <div>
            <kbd>V</kbd>
            <kbd>N</kbd>
            <kbd>E</kbd>
            <kbd>X</kbd>
            <span>outils</span>
          </div>
          <div>
            <kbd>Espace</kbd>
            <span>lecture / pause</span>
          </div>
          <div>
            <kbd>←</kbd>
            <kbd>→</kbd>
            <span>étape précédente / suivante</span>
          </div>
          <div>
            <kbd>Suppr</kbd>
            <span>retirer la sélection</span>
          </div>
          <div>
            <kbd>Ctrl</kbd>
            <kbd>Z</kbd>
            <span>annuler</span>
          </div>
          <div>
            <kbd>Échap</kbd>
            <span>annuler l'arête en cours</span>
          </div>
        </div>
      </section>
    </>
  );
}

function NodeInspector(props: {
  store: DocumentStore;
  id: string;
  onEdit(): void;
  onDeselect(): void;
}) {
  const { store, id, onEdit, onDeselect } = props;
  const node = store.doc.nodes.find((n) => n.id === id);
  if (!node) return <p className="hint">Ce sommet n'existe plus.</p>;

  return (
    <div className="inspector">
      <p className="inspector__id">sommet · {node.id}</p>
      <div className="field">
        <label htmlFor="node-label">Libellé</label>
        <input
          id="node-label"
          className="control"
          value={node.label}
          maxLength={6}
          onChange={(e) => {
            store.commit((prev) => updateNode(prev, id, { label: e.target.value }), 'Libellé modifié');
            onEdit();
          }}
        />
        <span className="field__help">
          Le libellé sert à la lecture. L'identifiant interne, lui, ne change jamais.
        </span>
      </div>
      <button
        type="button"
        className="btn btn--wide btn--danger"
        onClick={() => {
          store.commit((prev) => removeNode(prev, id), `Sommet ${node.label} supprimé`);
          onEdit();
          onDeselect();
        }}
      >
        Supprimer le sommet et ses arêtes
      </button>
    </div>
  );
}

function EdgeInspector(props: {
  store: DocumentStore;
  id: string;
  onEdit(): void;
  onDeselect(): void;
}) {
  const { store, id, onEdit, onDeselect } = props;
  const doc = store.doc;
  const edge = doc.edges.find((e) => e.id === id);
  if (!edge) return <p className="hint">Cette arête n'existe plus.</p>;

  const labelOf = (nodeId: string) => doc.nodes.find((n) => n.id === nodeId)?.label ?? nodeId;

  return (
    <div className="inspector">
      <p className="inspector__id">
        arête · {labelOf(edge.from)} {doc.flags.directed ? '→' : '—'} {labelOf(edge.to)}
      </p>

      {doc.flags.weighted ? (
        <div className="field">
          <label htmlFor="edge-weight">Poids</label>
          <input
            id="edge-weight"
            className="control"
            type="number"
            step={1}
            value={edge.weight ?? 1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              store.commit((prev) => updateEdge(prev, id, { weight: n }), 'Poids modifié');
              onEdit();
            }}
          />
          <span className="field__help">
            Un poids négatif est accepté par le modèle. Chaque algorithme dira s'il le supporte.
          </span>
        </div>
      ) : (
        <p className="hint">
          Graphe non pondéré : chaque arête compte pour 1. Active « Pondéré » pour saisir un poids.
        </p>
      )}

      <div className="field">
        <label htmlFor="edge-capacity">Capacité</label>
        <input
          id="edge-capacity"
          className="control"
          type="number"
          min={0}
          step={1}
          value={edge.capacity ?? ''}
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              store.commit((prev) => updateEdge(prev, id, { capacity: undefined }), 'Capacité retirée');
              onEdit();
              return;
            }
            const n = Number(raw);
            if (!Number.isFinite(n) || n < 0) return;
            store.commit((prev) => updateEdge(prev, id, { capacity: n }), 'Capacité modifiée');
            onEdit();
          }}
        />
        <span className="field__help">Utilisée par les problèmes de flot. Laisser vide sinon.</span>
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            store.commit(
              (prev) => updateEdge(prev, id, { from: edge.to, to: edge.from }),
              'Arête inversée',
            );
            onEdit();
          }}
        >
          Inverser
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            store.commit((prev) => removeEdge(prev, id), 'Arête supprimée');
            onEdit();
            onDeselect();
          }}
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}

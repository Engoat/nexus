/**
 * Parameter controls and precondition lists, generated from a declaration.
 *
 * Shared by the graph bench and the queue bench: both declare their parameters
 * the same way, so neither needs hand-written form code.
 */

import type { Issue, ParamSpec, ParamValue, ParamValues } from '../../algorithms/types';

interface FieldsProps {
  readonly params: readonly ParamSpec[];
  readonly values: ParamValues;
  onChange(id: string, value: ParamValue): void;
  /** Nodes offered by a `node` parameter. Empty on a bench without a graph. */
  readonly nodes?: readonly { id: string; label: string }[];
  /** Prefix for input ids, so two panels can coexist on one page. */
  readonly idPrefix?: string;
}

export function ParamFields({ params, values, onChange, nodes = [], idPrefix = 'p' }: FieldsProps) {
  return (
    <>
      {params.map((p) => {
        const value = values[p.id];
        const htmlId = `${idPrefix}-${p.id}`;

        switch (p.kind) {
          case 'node':
            return (
              <div className="field" key={p.id}>
                <label htmlFor={htmlId}>{p.label}</label>
                <select
                  id={htmlId}
                  className="control"
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => onChange(p.id, e.target.value === '' ? null : e.target.value)}
                >
                  <option value="">— aucun —</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
                {p.help ? <span className="field__help">{p.help}</span> : null}
              </div>
            );

          case 'number':
            return (
              <div className="field" key={p.id}>
                <label htmlFor={htmlId}>{p.label}</label>
                <div className="field__row">
                  <input
                    id={htmlId}
                    className="scrub"
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={typeof value === 'number' ? value : p.default}
                    onChange={(e) => onChange(p.id, Number(e.target.value))}
                  />
                  <input
                    className="control control--num"
                    type="number"
                    aria-label={`${p.label}, valeur exacte`}
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={typeof value === 'number' ? value : p.default}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) onChange(p.id, n);
                    }}
                  />
                </div>
                {p.help ? <span className="field__help">{p.help}</span> : null}
              </div>
            );

          case 'boolean':
            return (
              <div className="field" key={p.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={typeof value === 'boolean' ? value : p.default}
                    onChange={(e) => onChange(p.id, e.target.checked)}
                  />
                  {p.label}
                </label>
                {p.help ? <span className="field__help">{p.help}</span> : null}
              </div>
            );

          case 'choice':
            return (
              <div className="field" key={p.id}>
                <label htmlFor={htmlId}>{p.label}</label>
                <select
                  id={htmlId}
                  className="control"
                  value={typeof value === 'string' ? value : p.default}
                  onChange={(e) => onChange(p.id, e.target.value)}
                >
                  {p.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {p.help ? <span className="field__help">{p.help}</span> : null}
              </div>
            );
        }
      })}
    </>
  );
}

export function IssueList({ issues }: { readonly issues: readonly Issue[] }) {
  if (issues.length === 0) {
    return <p className="hint">Rien à signaler : les conditions d'application sont réunies.</p>;
  }
  const order = { error: 0, warning: 1 } as const;
  const sorted = [...issues].sort((a, b) => order[a.level] - order[b.level]);

  return (
    <>
      {sorted.map((i, k) => (
        <p className={`issue issue--${i.level}`} key={k}>
          <span className="issue__mark">{i.level === 'error' ? 'STOP' : 'NOTE'}</span>
          <span>
            <b>{i.message}</b>
            {i.fix ? <em>{i.fix}</em> : null}
          </span>
        </p>
      ))}
    </>
  );
}

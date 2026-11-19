/**
 * Generating a graph instead of drawing one.
 *
 * Each shape says what it is good for, because the point is not to fill the
 * canvas but to produce the situation a student needs to see: a disconnected
 * graph, a worst case, a negative cycle.
 */

import { useState } from 'react';

import { defaultParams, type ParamValue, type ParamValues } from '../../algorithms/types';
import { GENERATORS, generatorById } from '../generators';
import { ParamFields } from './ParamFields';

interface Props {
  onGenerate(id: string, params: ParamValues): void;
}

export function GeneratorPanel({ onGenerate }: Props) {
  const [id, setId] = useState(GENERATORS[0].id);
  const [values, setValues] = useState<Record<string, Record<string, ParamValue>>>({});

  const spec = generatorById(id) ?? GENERATORS[0];
  const params = values[spec.id] ?? defaultParams(spec);

  const setParam = (key: string, value: ParamValue) => {
    setValues((prev) => ({
      ...prev,
      [spec.id]: { ...(prev[spec.id] ?? defaultParams(spec)), [key]: value },
    }));
  };

  return (
    <section className="block">
      <h2 className="block__title">Générer un graphe</h2>

      <div className="field">
        <label htmlFor="gen-kind">Forme</label>
        <select
          id="gen-kind"
          className="control"
          value={spec.id}
          onChange={(e) => setId(e.target.value)}
        >
          {GENERATORS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <span className="field__help">{spec.summary}</span>
      </div>

      <p className="rationale" style={{ marginBottom: 'var(--sp3)' }}>
        {spec.purpose}
      </p>

      <ParamFields params={spec.params} values={params} onChange={setParam} idPrefix="gen" />

      <button
        type="button"
        className="btn btn--primary btn--wide"
        style={{ marginTop: 'var(--sp3)' }}
        onClick={() => onGenerate(spec.id, params)}
      >
        Générer
      </button>
      <p className="field__help" style={{ marginTop: 'var(--sp2)' }}>
        Remplace le graphe courant. Annulable avec Ctrl+Z.
      </p>
    </section>
  );
}

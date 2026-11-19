/**
 * The course tab.
 *
 * Reads the lesson written for the selected algorithm or model. Ordered the way
 * a student reads: the idea first, then what it is for, then how it proceeds,
 * then what to watch while the animation plays.
 */

import { GLOSSARY, type Lesson } from '../../content/lessons';

interface Props {
  readonly title: string;
  readonly lesson: Lesson | undefined;
  /** Jump to another algorithm from the "see also" list. */
  onGoTo?: (id: string) => void;
  readonly nameOf?: (id: string) => string;
}

export function LessonPanel({ title, lesson, onGoTo, nameOf }: Props) {
  if (!lesson) {
    return (
      <section className="block">
        <h2 className="block__title">Cours</h2>
        <p className="hint">Aucun cours écrit pour cette entrée.</p>
      </section>
    );
  }

  return (
    <div className="block">
      <h2 className="block__title">
        Cours
        <span className="count">{title}</span>
      </h2>

      <div className="lesson">
        <p className="lesson__note">
          <strong>L'idée :</strong> {lesson.idea}
        </p>

        <section>
          <h3>À quoi ça sert</h3>
          {lesson.what.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>

        <section>
          <h3>Comment ça marche</h3>
          <ol className="lesson__steps">
            {lesson.how.map((p, i) => (
              <li key={i}>
                <span>{i + 1}</span>
                <p>{p}</p>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h3>Ce qu'il faut regarder</h3>
          <ul>
            {lesson.watch.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>

        {lesson.formulas && lesson.formulas.length > 0 ? (
          <section>
            <h3>Formules</h3>
            {lesson.formulas.map((f) => (
              <div key={f.label}>
                <p className="struct__name">{f.label}</p>
                <pre className="lesson__formula">{f.body}</pre>
              </div>
            ))}
          </section>
        ) : null}

        <section>
          <h3>Quand on peut l'utiliser</h3>
          <ul>
            {lesson.conditions.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Coût</h3>
          <pre className="lesson__formula">{lesson.complexity.line}</pre>
          <p>{lesson.complexity.why}</p>
        </section>

        <section>
          <h3>Les erreurs classiques</h3>
          <ul className="lesson__pitfalls">
            {lesson.pitfalls.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>

        {lesson.terms.length > 0 ? (
          <section>
            <h3>Vocabulaire</h3>
            <dl className="lesson__terms">
              {lesson.terms.map((term) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{GLOSSARY[term] ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {lesson.seeAlso && lesson.seeAlso.length > 0 && onGoTo ? (
          <section>
            <h3>À comparer avec</h3>
            <ul className="lesson__links">
              {lesson.seeAlso.map((link) => (
                <li key={link.id}>
                  <button type="button" className="btn btn--wide" onClick={() => onGoTo(link.id)}>
                    {nameOf ? nameOf(link.id) : link.id}
                  </button>
                  <span>{link.why}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

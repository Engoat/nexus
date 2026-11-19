/**
 * Why a button is greyed out.
 *
 * A disabled control that stays silent is the fastest way to lose a student.
 * Each blocking reason is shown next to the button that it blocks, with the
 * move that unblocks it.
 */

import type { Issue } from '../../algorithms/types';

interface Props {
  readonly issues: readonly Issue[];
  /** Shown above the list. */
  readonly title?: string;
  /** A softer tone, for an explanation that is not an error. */
  readonly soft?: boolean;
}

export function WhyDisabled({ issues, title, soft = false }: Props) {
  const blocking = issues.filter((i) => i.level === 'error');
  if (blocking.length === 0) return null;

  return (
    <div className={`why${soft ? ' why--soft' : ''}`} role="note">
      <p>{title ?? (blocking.length === 1 ? 'Impossible pour une raison :' : `Impossible pour ${blocking.length} raisons :`)}</p>
      <ul>
        {blocking.map((issue, i) => (
          <li key={i}>
            <span>
              <b>{issue.message}</b>
              {issue.fix ? <em>{issue.fix}</em> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One-line summary for a `title` attribute. */
export function blockingSummary(issues: readonly Issue[]): string | undefined {
  const blocking = issues.filter((i) => i.level === 'error');
  if (blocking.length === 0) return undefined;
  return blocking.map((i) => i.message).join(' ');
}

/**
 * A disclosure menu, to get rarely used actions out of the way.
 *
 * Thirteen buttons in a toolbar intimidate before they help. The ones a student
 * touches once per session live in here; the ones they touch constantly stay
 * visible. Closes on Escape, on an outside click, and after an action runs.
 */

import { useEffect, useId, useRef, useState } from 'react';

export interface MenuItem {
  readonly label: string;
  /** Shown under the label when the action deserves a word of warning. */
  readonly help?: string;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  onSelect(): void;
}

interface Props {
  readonly label: string;
  readonly items: readonly MenuItem[];
  /** Pulls the popup to the right edge of the button. */
  readonly align?: 'start' | 'end';
}

export function Menu({ label, items, align = 'end' }: Props) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        host.current?.querySelector('button')?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) setOpen(false);
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div className="menu" ref={host} data-align={align}>
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span className="menu__chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="menu__popup" id={id} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="menu__item"
              data-danger={item.danger ?? false}
              disabled={item.disabled ?? false}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.help ? <em>{item.help}</em> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

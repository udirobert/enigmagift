import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Trust UI kit — the "informed but not verbose" pattern: one icon + one line
 * on screen, the full explanation one tap away.
 */

/** A small ⓘ that opens a popover (click, not hover — works on touch). */
export function InfoDot({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);
  return (
    <span className="info-dot-wrap" ref={ref}>
      <button
        type="button"
        className={`info-dot${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && (
        <span className="info-pop" role="tooltip">
          {children}
        </span>
      )}
    </span>
  );
}

/** One glanceable line of trust: icon + sentence + optional "i" popover. */
export function TrustRow({
  icon,
  children,
  more,
}: {
  icon: string;
  children: ReactNode;
  more?: { label: string; body: ReactNode };
}) {
  return (
    <div className="trust-row">
      <span className="trust-icon" aria-hidden>
        {icon}
      </span>
      <span className="trust-text">
        {children}
        {more && <InfoDot label={more.label}>{more.body}</InfoDot>}
      </span>
    </div>
  );
}

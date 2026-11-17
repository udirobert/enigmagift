import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion } from '../lib/motion';
import { Photo } from '../components/Photo';
import { hideGift, type HideSpot } from '../lib/api';

interface HideProps {
  demo: boolean;
  giftId: string | null;
  /** the hide spot the buyer approved in the editor (null = "somewhere else") */
  hideSpot: HideSpot | null;
  /** object-url previews of the buyer's photos, for the spot thumb */
  preview?: string[];
  onDone: (hidden: boolean) => void;
}

const CHECKLIST = [
  'hide the thing somewhere it can stay — a night, a week, until they find it',
  'photograph where you hid it, so the trail stays honest',
  'don’t tell them — that’s the whole point',
];

/**
 * Step four — the part only the buyer can do. The agent scouted the
 * territory; now they leave something real there. "i'll hide it later"
 * is a first-class exit: the link still seals, the hide is just unwritten.
 */
export function Hide({ demo, giftId, hideSpot, preview, onDone }: HideProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.hide-anim', { opacity: 1, y: 0 });
        return;
      }
      gsap.from('.hide-anim', {
        opacity: 0,
        y: 22,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.13,
        clearProps: 'all',
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const thumb =
    !demo && hideSpot?.basedOnObservation != null
      ? preview?.[hideSpot.basedOnObservation]
      : undefined;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (!demo && giftId) {
      try {
        await hideGift(giftId, {
          hideSpotId: hideSpot?.id ?? null,
          hideNote: note.trim() || null,
          hiddenAt: new Date().toISOString(),
        });
      } catch (e) {
        // the hide is between them and the place — a failed post must not
        // block the ritual; note it and carry on to the seal
        setError('couldn’t reach the api — the hide still counts');
      }
    }
    onDone(true);
  };

  const later = () => onDone(false);

  return (
    <section className="scene scene-hide" ref={rootRef}>
      <div className="scene-inner hide-inner">
        <header className="hide-head">
          <p className="kicker hide-anim">step four — hide it</p>
          <h2 className="scene-title hide-anim">now it’s yours to hide</h2>
          <p className="lede small hide-anim">
            the agent read the place and proposed where it should go. you are
            the last pair of hands — nothing reaches them until it’s really
            there.
          </p>
        </header>

        <div className="hide-spot hide-anim">
          {thumb && (
            <div className="hide-spot-media">
              <Photo src={thumb} ratio="4 / 5" taped alt="" />
            </div>
          )}
          <div className="hide-spot-body">
            <p className="clue-kicker">the proposed spot</p>
            <p className="hide-spot-text">
              {hideSpot?.description ??
                'somewhere only the two of you would think to look'}
            </p>
            <p className="hide-spot-sub">
              {demo
                ? 'a guess, honestly labelled — approve it or pick your own'
                : 'read off your photographs — change it if it doesn’t feel right'}
            </p>
          </div>
        </div>

        <ul className="hide-checklist hide-anim">
          {CHECKLIST.map((c) => (
            <li key={c}>
              <span className="hide-check" aria-hidden />
              <span>{c}</span>
            </li>
          ))}
        </ul>

        <label className="hide-note-wrap hide-anim">
          <span className="clue-kicker">a note for the record (optional)</span>
          <textarea
            className="hide-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="where exactly, and what’s inside…"
          />
        </label>

        <div className="hide-actions hide-anim">
          <button
            className="btn btn-primary"
            onClick={confirm}
            disabled={busy}
          >
            {busy ? 'noted…' : 'i’ve hidden it'}
          </button>
          <button className="demo-link" onClick={later} disabled={busy}>
            i’ll hide it later
          </button>
        </div>

        {error && <p className="foot-note hide-anim">{error}</p>}
      </div>
    </section>
  );
}

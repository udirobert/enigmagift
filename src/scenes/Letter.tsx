import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { LETTER_DRAFTS } from '../data';
import { prefersReducedMotion } from '../lib/motion';
import { letterDrafts, saveLetter, type Gift, type GiftMode } from '../lib/api';
import type { Direction } from '../App';

interface LetterProps {
  demo: boolean;
  gift: Gift | null;
  giftId: string | null;
  direction: Direction;
  mode: GiftMode;
  /** the clue count the editor kept — the letter sits next to what it follows */
  kept: number;
  onNext: () => void;
}

const MAX = 1200;
const MIN = 20;

/**
 * The giver's own words. The one thing the recipient keeps that no model can
 * write for them — the agent may offer three openings, but the letter is
 * theirs. Sits between the clues and the seal, so the writing happens when the
 * gift is already real in their hands.
 */
export function Letter({ demo, gift, giftId, direction, mode, kept, onNext }: LetterProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [message, setMessage] = useState(gift?.message ?? '');
  const [signature, setSignature] = useState(gift?.signature ?? '');
  const [drafts, setDrafts] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // a resumed draft arrives with the gift payload — seed from it once
  useEffect(() => {
    if (gift?.message && !message) setMessage(gift.message);
    if (gift?.signature && !signature) setSignature(gift.signature);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gift]);

  const live = !demo && !!giftId;
  const words = message.trim().length;
  const ready = words >= MIN;

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) return;
      // the sheet settles onto the table like paper — controls never move
      gsap.fromTo(
        '.letter-sheet',
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', clearProps: 'opacity,y' },
      );
    }, rootRef);
    const settle = () => ctx.revert();
    const el = rootRef.current;
    const vv = window.visualViewport;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    el?.addEventListener('pointerdown', settle, { capture: true });
    window.addEventListener('keydown', settle, { capture: true });
    el?.addEventListener('focusin', settle, { capture: true });
    window.addEventListener('resize', settle);
    vv?.addEventListener('resize', settle);
    mq.addEventListener('change', settle);
    return () => {
      el?.removeEventListener('pointerdown', settle, { capture: true });
      window.removeEventListener('keydown', settle, { capture: true });
      el?.removeEventListener('focusin', settle, { capture: true });
      window.removeEventListener('resize', settle);
      vv?.removeEventListener('resize', settle);
      mq.removeEventListener('change', settle);
      ctx.revert();
    };
  }, []);

  const askForDrafts = async () => {
    if (drafting) return;
    setDrafting(true);
    setDraftMsg(null);
    if (!live) {
      // demo / offline: the scripted openings, no model call
      window.setTimeout(() => {
        setDrafts(LETTER_DRAFTS);
        setDrafting(false);
      }, prefersReducedMotion() ? 0 : 450);
      return;
    }
    try {
      const r = await letterDrafts(giftId!, message.trim());
      setDrafts(r.drafts ?? []);
      if (!r.drafts?.length) setDraftMsg('no drafts came back — your own words are better anyway');
    } catch {
      setDraftMsg('couldn’t reach the writer just now — write it yourself, it’s better');
    } finally {
      setDrafting(false);
    }
  };

  const useDraft = (text: string) => {
    // replacing more than a few words should be a decision, not an accident
    if (message.trim().length > MIN && !window.confirm('replace what you’ve written with this draft?')) {
      return;
    }
    setMessage(text);
    setDrafts([]);
  };

  const next = async () => {
    if (!ready || saving) return;
    setError(null);
    if (!live) {
      // demo: the reveal three screens on should read these words back, not a
      // stranger's sample — the whole point is that they wrote it
      try {
        sessionStorage.setItem(
          'enigmagift.letter.v1',
          JSON.stringify({ message: message.trim(), signature: signature.trim() }),
        );
      } catch {
        /* private mode — the reveal falls back to the sample */
      }
      onNext();
      return;
    }
    setSaving(true);
    try {
      await saveLetter(giftId!, message.trim(), signature.trim());
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'couldn’t save the letter — try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="scene scene-letter" ref={rootRef}>
      <div className="scene-inner letter-inner">
        <header className="letter-head">
          <p className="kicker letter-anim">one last thing</p>
          <h2 className="scene-title letter-anim">the part they keep.</h2>
          <p className="lede small letter-anim">
            {kept} clue{kept === 1 ? '' : 's'} walk them to the place. this is what
            they find when they get there — write it the way you’d say it out loud.
          </p>
        </header>

        <div className="letter-sheet">
          <p className="letter-salutation">
            {direction === 'me' ? 'dear future me,' : 'dear you,'}
          </p>
          <textarea
            className="letter-write"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
            rows={5}
            placeholder="the thing i never said about this place is…"
            aria-label="your letter to them"
            aria-describedby="letter-count"
          />
          <label className="letter-sign-row">
            <span aria-hidden>—</span>
            <input
              className="letter-sign-input"
              value={signature}
              onChange={(e) => setSignature(e.target.value.slice(0, 60))}
              placeholder="your name, or nothing at all"
              aria-label="signature"
            />
          </label>
        </div>

        <div className="letter-help letter-anim">
          <button className="demo-link" onClick={() => void askForDrafts()} disabled={drafting}>
            {drafting
              ? 'reading the photos again…'
              : drafts.length
                ? 'another three →'
                : 'help me start →'}
          </button>
          {draftMsg && <p className="foot-note">{draftMsg}</p>}
          {drafts.length > 0 && (
            <ul className="letter-drafts" aria-label="opening drafts">
              {drafts.map((d) => (
                <li key={d}>
                  <p>{d}</p>
                  <button className="demo-link" onClick={() => useDraft(d)}>
                    use this →
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="foot-note">
            drafts are made from what the photos showed — every word is yours to change.
          </p>
        </div>

        <div className="letter-foot letter-anim">
          <p className="foot-note" id="letter-count" aria-live="polite">
            {error
              ? error
              : !ready
                ? `a few more words — ${Math.max(0, MIN - words)} to go`
                : signature.trim()
                  ? `signed · ${mode === 'physical' ? 'next: hide it, then seal' : 'next: seal the gift'}`
                  : `${words} / ${MAX} characters · unsigned — it’ll end with “the one who left it there”`}
          </p>
          <button className="btn btn-primary" onClick={() => void next()} disabled={!ready || saving}>
            {saving ? 'Saving…' : 'fold it in →'}
          </button>
        </div>
      </div>
    </section>
  );
}

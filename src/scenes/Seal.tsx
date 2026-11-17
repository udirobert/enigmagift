import { useEffect, useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { SEAL_LINK } from '../data';
import { prefersReducedMotion } from '../lib/motion';
import { WaxSeal } from '../components/WaxSeal';
import { markPaid, sealGift, type SealResult } from '../lib/api';

interface SealProps {
  demo: boolean;
  giftId: string | null;
  kept: number;
  /** buyer preview — pass the trail token so the rounds can play the real data */
  onSend: (token: string | null) => void;
}

const STRIPE_LINK: string | undefined = import.meta.env.VITE_STRIPE_LINK;
const PRICE = '£19';

/**
 * The seal — and the till. Live gifts don't seal until the £19 clears:
 * the CTA opens the Stripe Payment Link in a new tab, and on return
 * (?paid=1, window focus, or the explicit "i've paid" nudge) we mark the
 * gift paid and seal for real. Demo mode keeps the old theatre.
 */
export function Seal({ demo, giftId, kept, onSend }: SealProps) {
  const rootRef = useRef<HTMLElement>(null);
  const sealRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SealResult | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  // idle → awaiting payment → working → sealed | error
  const [phase, setPhase] = useState<'idle' | 'awaiting' | 'working' | 'sealed' | 'error'>(
    demo || !giftId ? 'sealed' : 'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const workingRef = useRef(false);

  const live = !demo && !!giftId;

  // Stripe return: ?paid=1 means the payment link sent them back here
  useEffect(() => {
    if (!live) return;
    const paid = new URLSearchParams(window.location.search).get('paid') === '1';
    if (paid) void finalize(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, giftId]);

  // while awaiting payment, waking back up with ?paid=1 seals the gift
  useEffect(() => {
    if (phase !== 'awaiting') return;
    const onFocus = () => {
      const paid = new URLSearchParams(window.location.search).get('paid') === '1';
      if (paid) void finalize(true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /** mark paid (when we know they paid) then seal — the real trail */
  const finalize = async (paid: boolean) => {
    if (!giftId || workingRef.current) return;
    workingRef.current = true;
    setPhase('working');
    setError(null);
    try {
      if (paid) {
        try {
          const sid = new URLSearchParams(window.location.search).get('sid');
          await markPaid(giftId, sid);
        } catch {
          /* payment marking is best-effort — the seal still matters */
        }
      }
      const r = await sealGift(giftId);
      setResult(r);
      setCode(r.unlockCode ?? null);
      setPhase('sealed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'couldn’t seal — try again');
      setPhase('error');
    } finally {
      workingRef.current = false;
    }
  };

  const pay = () => {
    if (!giftId || !STRIPE_LINK) return;
    const url = `${STRIPE_LINK}${STRIPE_LINK.includes('?') ? '&' : '?'}client_reference_id=${giftId}`;
    window.open(url, '_blank', 'noopener');
    setPhase('awaiting');
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1600);
    } catch {
      setCopiedCode(false);
    }
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.seal-anim', { opacity: 1, y: 0, scale: 1 });
        return;
      }
      gsap.from('.seal-anim', {
        opacity: 0,
        y: 22,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.14,
        clearProps: 'all',
      });
      // the seal settles like wax finding paper
      gsap.fromTo(
        sealRef.current,
        { scale: 1.15, rotate: -6, opacity: 0 },
        { scale: 1, rotate: 0, opacity: 1, duration: 1.1, ease: 'power2.out', delay: 0.3 },
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const token = result?.trailToken ?? null;
  const displayLink = demo
    ? SEAL_LINK
    : token
      ? `${window.location.origin}/?t=${token}`
      : live
        ? 'the link appears once it’s sealed'
        : SEAL_LINK;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        demo ? `https://${displayLink}` : displayLink,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const send = () => {
    if (sending || phase === 'working' || phase === 'awaiting') return;
    setSending(true);
    const go = () => onSend(demo ? null : token);
    if (prefersReducedMotion() || !sealRef.current) {
      window.setTimeout(go, 300);
      return;
    }
    // press the seal, then send
    gsap.to(sealRef.current, {
      scale: 0.86,
      rotate: 4,
      duration: 0.22,
      ease: 'power2.in',
      yoyo: true,
      repeat: 1,
      onComplete: () => window.setTimeout(go, 350),
    });
  };

  const waiting = phase === 'awaiting' || phase === 'working';
  const sealed = phase === 'sealed';

  return (
    <section className="scene scene-seal" ref={rootRef}>
      <div className="scene-inner seal-inner">
        <div className="seal-anim" ref={sealRef}>
          <WaxSeal size={188} />
        </div>

        <p className="kicker seal-anim">step five — the seal</p>
        <h2 className="scene-title seal-anim">
          {waiting
            ? phase === 'awaiting'
              ? 'waiting on the till'
              : 'sealing…'
            : error
              ? 'the seal jammed'
              : 'the gift is sealed'}
        </h2>
        <p className="lede seal-anim">
          {kept} clue{kept === 1 ? '' : 's'} inside, nothing else. one link, one
          person — send it however you like.
        </p>
        {phase === 'awaiting' && (
          <p className="foot-note seal-anim">
            finish the payment in the other tab — this page wakes up when you’re
            back. or tell it yourself:
          </p>
        )}
        {error && <p className="foot-note seal-anim">{error}</p>}

        <div className={`seal-link seal-anim ${waiting && !sealed ? 'is-waiting' : ''}`}>
          <span className="seal-link-url">
            {waiting && !sealed ? 'wax is setting…' : displayLink}
          </span>
          {sealed && (
            <button className="seal-copy" onClick={copy}>
              {copied ? 'copied' : 'copy'}
            </button>
          )}
        </div>

        {!demo && code && sealed && (
          <div className="seal-code seal-anim">
            <p className="seal-code-label">
              write this into the hidden thing — it’s the only key
            </p>
            <div className="seal-code-row">
              <span className="seal-code-value">{code}</span>
              <button className="seal-copy" onClick={copyCode}>
                {copiedCode ? 'copied' : 'copy'}
              </button>
            </div>
          </div>
        )}

        <div className="seal-qr seal-anim" aria-label="qr code placeholder">
          <svg viewBox="0 0 21 21" className="qr-glyph" aria-hidden>
            <QRPattern />
          </svg>
          <span className="qr-label">scan to open</span>
        </div>

        {/* the till — live gifts pay first, demo just presses the wax */}
        {live && !sealed && (
          <div className="seal-pay seal-anim">
            {STRIPE_LINK ? (
              <button className="btn btn-primary" onClick={pay} disabled={waiting}>
                {phase === 'awaiting' ? 'waiting for payment…' : `seal & send — ${PRICE}`}
              </button>
            ) : (
              <button className="btn btn-primary" disabled>
                payments opening soon
              </button>
            )}
            {phase === 'awaiting' && (
              <button className="demo-link" onClick={() => void finalize(true)}>
                i’ve paid — continue
              </button>
            )}
            {!STRIPE_LINK && (
              <button className="demo-link" onClick={() => void finalize(false)}>
                preview the trail without paying →
              </button>
            )}
          </div>
        )}

        {(!live || sealed || phase === 'error') && (
          <button
            className="btn btn-primary seal-anim"
            onClick={phase === 'error' ? () => void finalize(false) : send}
            disabled={sending || waiting}
          >
            {phase === 'error'
              ? 'try again'
              : demo
                ? 'watch what they see →'
                : 'send it →'}
          </button>
        )}

        <p className="foot-note seal-anim">
          it opens gently — three looks, then it gives itself up. no passwords.
        </p>
      </div>
    </section>
  );
}

/** Decorative pseudo-QR: deterministic finder squares + noise cells. */
function QRPattern() {
  const cells: ReactNode[] = [];
  let n = 7;
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      n = (n * 1103515245 + 12345) % 2147483648;
      const inFinder =
        (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (inFinder) continue;
      if (n % 3 === 0) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  }
  return (
    <g fill="currentColor">
      {/* finder patterns */}
      {[
        [0, 0],
        [14, 0],
        [0, 14],
      ].map(([fx, fy]) => (
        <g key={`${fx}-${fy}`}>
          <rect x={fx} y={fy} width="7" height="7" />
          <rect x={fx + 1} y={fy + 1} width="5" height="5" fill="var(--ink)" />
          <rect x={fx + 2} y={fy + 2} width="3" height="3" />
        </g>
      ))}
      {cells}
    </g>
  );
}

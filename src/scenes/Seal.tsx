import { useEffect, useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { SEAL_LINK } from '../data';
import { prefersReducedMotion } from '../lib/motion';
import { WaxSeal } from '../components/WaxSeal';
import { deleteGift, markPaid, revokeTrail, sealGift, type GiftMode, type SealResult, type Tier } from '../lib/api';
import { TrustRow } from '../components/TrustRow';
import { QRCode } from '../components/QRCode';

interface SealProps {
  demo: boolean;
  giftId: string | null;
  kept: number;
  tier: Tier;
  mode: GiftMode;
  /** buyer preview — pass the trail token so the rounds can play the real data */
  onSend: (token: string | null) => void;
}

// one Stripe Payment Link per tier (legacy single VITE_STRIPE_LINK maps to hide)
const STRIPE_LINKS: Record<Tier, string | undefined> = {
  trail: import.meta.env.VITE_STRIPE_LINK_TRAIL,
  hide: import.meta.env.VITE_STRIPE_LINK_HIDE ?? import.meta.env.VITE_STRIPE_LINK,
  set: import.meta.env.VITE_STRIPE_LINK_SET,
};
const PRICES: Record<Tier, string> = { trail: '£4.99', hide: '£9.99', set: '£19' };
const TIER_NAMES: Record<Tier, string> = { trail: 'the trail', hide: 'the hide', set: 'the set' };
const TIER_INCLUDES: Record<Tier, string> = {
  trail: 'one recipient link — opens the keepsake directly',
  hide: 'one recipient link + a code you write into the hidden thing',
  set: 'a pack of three hunts — this one, plus two more',
};

/**
 * The seal — and the till. Live gifts don't seal until the £19 clears:
 * the CTA opens the Stripe Payment Link in a new tab, and on return
 * (?paid=1, window focus, or the explicit "i've paid" nudge) we mark the
 * gift paid and seal for real. Demo mode keeps the old theatre.
 */
export function Seal({ demo, giftId, kept, tier, mode, onSend }: SealProps) {
  const STRIPE_LINK = STRIPE_LINKS[tier];
  const PRICE = PRICES[tier];
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
  const [revoked, setRevoked] = useState(false);
  const [deleted, setDeleted] = useState(false);
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
      const paid =
        new URLSearchParams(window.location.search).get('paid') === '1' ||
        sessionStorage.getItem('eg_paid') === '1';
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
          // App stashes the Stripe session id in sessionStorage and strips it
          // from the URL; fall back to the URL in case that didn't run
          const sid =
            new URLSearchParams(window.location.search).get('sid') ??
            sessionStorage.getItem('eg_sid');
          // server verifies the session when STRIPE_API_KEY is set; otherwise
          // it reports pending and only the signed webhook sets paid
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

  const revoke = async () => {
    if (!giftId || revoked) return;
    if (!window.confirm('revoke the recipient link? anyone holding it will no longer be able to open the gift.')) return;
    try {
      await revokeTrail(giftId);
      setRevoked(true);
    } catch {
      setError('couldn’t revoke — try again');
    }
  };

  const remove = async () => {
    if (!giftId || deleted) return;
    if (!window.confirm('delete this gift for good? the link stops opening, and the photos, world and portrait are erased from our server.')) return;
    try {
      await deleteGift(giftId);
      setDeleted(true);
    } catch {
      setError('couldn’t delete — try again');
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
      ? `${window.location.origin}/t/${token}`
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
            {deleted ? 'deleted — gone for good' : revoked ? 'link revoked — this trail no longer opens' : waiting && !sealed ? 'wax is setting…' : displayLink}
          </span>
          {sealed && !revoked && !deleted && (
            <button className="seal-copy" onClick={copy}>
              {copied ? 'copied' : 'copy'}
            </button>
          )}
        </div>

        {/* manage — revoke / delete / what's stored, one glance, one click each */}
        {sealed && live && !deleted && (
          <div className="seal-manage seal-anim">
            <span className="seal-manage-label">
              {revoked ? 'link revoked — the trail no longer opens' : 'live — the link opens for anyone who has it'}
            </span>
            <span className="seal-manage-actions">
              {!revoked && (
                <button className="demo-link" onClick={() => void revoke()}>
                  revoke link
                </button>
              )}
              <button className="demo-link seal-danger" onClick={() => void remove()}>
                delete gift
              </button>
              <a className="demo-link" href="/privacy" target="_blank" rel="noreferrer">
                what’s stored
              </a>
            </span>
          </div>
        )}

        {!demo && code && sealed && mode === 'physical' && (
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
            <a
              className="demo-link"
              href="/assets/recraft/you-found-it-card.svg"
              target="_blank"
              rel="noopener"
            >
              or print the card it goes in →
            </a>
          </div>
        )}

        {!demo && sealed && mode === 'digital' && (
          <p className="foot-note seal-anim">
            no code, nothing to hide — the link opens the keepsake directly
          </p>
        )}
        {!demo && sealed && mode === 'physical' && !code && (
          <p className="foot-note seal-anim">
            the code was shown when you first sealed — write it into the hidden
            thing now. lost it? delete the gift and remake it.
          </p>
        )}

        <div className="seal-qr seal-anim" aria-label={sealed && token && !demo ? 'qr code — scans to the gift' : 'qr code placeholder'}>
          {sealed && token && !demo && !revoked && !deleted ? (
            <QRCode value={displayLink} />
          ) : (
            <svg viewBox="0 0 21 21" className="qr-glyph" aria-hidden>
              <QRPattern />
            </svg>
          )}
          <span className="qr-label">scan to open</span>
        </div>

        {/* the card for the hidden thing (Hide tier) — real QR + code, printable */}
        {sealed && mode === 'physical' && code && !demo && !revoked && !deleted && (
          <div className="seal-card seal-anim" id="seal-card">
            <p className="seal-card-title">the card for inside the hidden thing</p>
            <QRCode value={displayLink} />
            <p className="seal-card-link mono">{displayLink.replace(/^https?:\/\//, '')}</p>
            <p className="seal-card-code-label">or type the code</p>
            <p className="seal-card-code">{code}</p>
            <button className="demo-link seal-card-print" onClick={() => window.print()}>
              print this card →
            </button>
          </div>
        )}

        {/* the till — live gifts pay first, demo just presses the wax */}
        {live && !sealed && !deleted && (
          <div className="seal-pay seal-anim">
            {/* order summary — price, what's included, who takes the money, refunds */}
            <div className="seal-order">
              <div className="seal-order-head">
                <span>{TIER_NAMES[tier]}</span>
                <span>{PRICE}</span>
              </div>
              <p className="seal-order-includes">{TIER_INCLUDES[tier]}</p>
              <TrustRow icon="🔒">paid by stripe — we never see your card</TrustRow>
              <TrustRow
                icon="↩"
                more={{
                  label: 'refund policy',
                  body: (
                    <>
                      digital gifts are delivered instantly, but if the trail
                      flops — wrong place, broken link — email us within 14
                      days and we’ll refund or redo it. your statutory rights
                      are unaffected.{' '}
                      <a href="/terms" target="_blank" rel="noreferrer">terms</a>
                    </>
                  ),
                }}
              >
                if the trail flops, we refund within 14 days
              </TrustRow>
            </div>
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

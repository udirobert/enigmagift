import { useEffect, useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { SEAL_LINK } from '../data';
import { prefersReducedMotion } from '../lib/motion';
import { WaxSeal } from '../components/WaxSeal';
import { ApiError, deleteGift, markPaid, revokeTrail, sealGift, type GiftMode, type SealResult, type Tier } from '../lib/api';
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
  /** mid-flow upsell (Trail → Hide) — only wired for live, unsealed gifts */
  onTier?: (t: Tier) => void;
  /** this gift was spawned from a Set pack, so it cannot itself become one */
  packOwned?: boolean;
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
  trail: 'one gift link — opens the keepsake directly',
  hide: 'one gift link + a code you write into the hidden thing',
  set: 'a pack of three hunts — this one, plus two more',
};

/**
 * The seal — and the till. Live gifts don't seal until payment clears:
 * the CTA opens the Stripe Payment Link in a new tab, and on return
 * (?paid=1, window focus, or the explicit "i've paid" nudge) we mark the
 * gift paid and seal for real. Demo mode keeps the old theatre.
 */
export function Seal({ demo, giftId, kept, tier, mode, onSend, onTier, packOwned = false }: SealProps) {
  const STRIPE_LINK = STRIPE_LINKS[tier];
  const PRICE = PRICES[tier];
  const rootRef = useRef<HTMLElement>(null);
  const sealRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SealResult | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  // Phase 1b — where the link should be sent, and when it should open.
  const [email, setEmail] = useState('');
  const [sendDate, setSendDate] = useState('');
  // Phase 4 — the Hide fallback: "if I don't hide it, open it on <date>"
  const [fallbackDate, setFallbackDate] = useState('');
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
          /* payment marking is best-effort; sealing itself fails closed below */
        }
      }
      let r: SealResult | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          r = await sealGift(giftId, {
            email: email.trim() || undefined,
            sendAt: sendDate || undefined,
            fallbackAt: mode === 'physical' && fallbackDate ? fallbackDate : undefined,
          });
          break;
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 402 || attempt === 3) throw e;
          await new Promise((resolve) => window.setTimeout(resolve, 1600));
        }
      }
      if (!r) throw new ApiError('payment is still pending', 402);
      setResult(r);
      setCode(r.unlockCode ?? null);
      setPhase('sealed');
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setError('stripe hasn’t confirmed the payment yet — give it a few seconds, then try again');
        setPhase('awaiting');
      } else {
        setError(e instanceof Error ? e.message : 'couldn’t seal — try again');
        setPhase('error');
      }
    } finally {
      workingRef.current = false;
    }
  };

  const revoke = async () => {
    if (!giftId || revoked) return;
    if (!window.confirm('Close this gift link? It will stop opening immediately. This cannot be undone.')) return;
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
    // Phase 1b — record that payment was attempted (ops visibility on
    // abandonment; best-effort, never blocks the flow)
    void fetch(`/api/gifts/${giftId}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    }).catch(() => {});
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
      if (prefersReducedMotion()) return;
      // the seal settles like wax finding paper — controls never move
      gsap.fromTo(
        sealRef.current,
        { scale: 0.98, rotate: -3, opacity: 0.9 },
        { scale: 1, rotate: 0, opacity: 1, duration: 0.32, ease: 'power3.out', clearProps: 'transform,opacity' },
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
    onSend(demo ? null : token);
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
              ? 'waiting for payment'
              : 'getting your gift ready…'
            : error
              ? 'your gift couldn’t be saved'
              : sealed ? 'your gift is ready' : 'finish your gift'}
        </h2>
        <p className="lede seal-anim">
          {kept} clue{kept === 1 ? '' : 's'}, ready for them to discover.
        </p>
        {phase === 'awaiting' && (
          <p className="foot-note seal-anim">
            Finish payment in the other tab, then come back here.
          </p>
        )}
        {error && <p className="foot-note seal-anim">{error}</p>}

        <div className={`seal-link seal-anim ${waiting && !sealed ? 'is-waiting' : ''}`}>
          <span className="seal-link-url">
            {deleted ? 'deleted — gone for good' : revoked ? 'gift link closed — the link no longer opens' : waiting && !sealed ? 'creating your link…' : displayLink}
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
              {revoked ? 'gift link closed — the link no longer opens' : 'Anyone with this link can open your gift.'}
            </span>
            <span className="seal-manage-actions">
              {!revoked && (
                <button className="demo-link" onClick={() => void revoke()}>
                  close gift link
                </button>
              )}
              {giftId && (
                <a className="demo-link" href={`/?g=${giftId}`}>
                  your gift controls →
                </a>
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
            {result?.sendAt
              ? `sealed — the link opens ${new Date(result.sendAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${email ? ` and arrives at ${email}` : ''}`
              : `sealed${email ? ` — the link is on its way to ${email}` : ''} — no code, nothing to hide, the link opens the keepsake directly`}
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
              {/* Phase 3 — tier selection lives here, at the till, where the
                  buyer has felt the trail and is choosing an ending. The pack
                  row is minted server-side when the money lands, so a set can
                  be sold right here; only a hunt that came *out* of a pack is
                  excluded, since buying one twice is not a thing. */}
              <div className="seg dock-seg seal-tier" role="group" aria-label="which gift">
                {(packOwned ? (['trail', 'hide'] as Tier[]) : (['trail', 'hide', 'set'] as Tier[])).map((t) => (
                  <button
                    key={t}
                    className={tier === t ? 'is-active' : ''}
                    aria-pressed={tier === t}
                    disabled={waiting}
                    onClick={() => onTier?.(t)}
                  >
                    {TIER_NAMES[t]} · {PRICES[t]}
                  </button>
                ))}
              </div>
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
              <>
                <div className="seal-delivery">
                  <label className="seal-delivery-label" htmlFor="seal-email">
                    where should we send the link?
                  </label>
                  <input
                    id="seal-email"
                    className="seal-delivery-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="seal-delivery-note">
                    we send the link there and keep the address only to deliver
                    this gift — nothing else, deleted with the gift. losing the
                    tab won’t lose the gift.
                  </p>
                  <label className="seal-delivery-label" htmlFor="seal-date">
                    should it open on a particular day? <span className="seal-optional">optional</span>
                  </label>
                  <input
                    id="seal-date"
                    className="seal-delivery-input"
                    type="date"
                    value={sendDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setSendDate(e.target.value)}
                  />
                  {mode === 'physical' && (
                    <>
                      <label className="seal-delivery-label" htmlFor="seal-fallback">
                        if you don't manage to hide it, open anyway on{' '}
                        <span className="seal-optional">recommended</span>
                      </label>
                      <input
                        id="seal-fallback"
                        className="seal-delivery-input"
                        type="date"
                        value={fallbackDate}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setFallbackDate(e.target.value)}
                      />
                      <p className="seal-delivery-note">
                        after this day the keepsake opens without the code — a
                        gift that never dead-ends, even if the errand slips.
                      </p>
                    </>
                  )}
                </div>
                <button className="btn btn-primary" onClick={pay} disabled={waiting}>
                  {phase === 'awaiting' ? 'waiting for payment…' : `finish your gift — ${PRICE}`}
                </button>
              </>
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
            {phase === 'error' ? 'try again' : 'see what they see →'}
          </button>
        )}

        <p className="foot-note seal-anim">
          it opens gently — a few looks, then it gives itself up. no passwords.
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

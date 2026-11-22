import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteGift,
  getGiftOverview,
  logGiftEvent,
  revokeTrail,
  type GiftOverview,
} from '../lib/api';
import { QRCode } from '../components/QRCode';
import { TrustRow } from '../components/TrustRow';

interface DashProps {
  giftId: string;
  onHome: () => void;
}

const TIER_LABEL: Record<string, string> = {
  trail: 'the trail · £4.99 · digital',
  hide: 'the hide · £9.99 · physical',
  set: 'the set · £19 · pack of 3',
};

/** one line per funnel event — the giver sees the hunt happen, not raw names */
function humanEvent(e: { name: string; data: Record<string, unknown> }): string {
  const d = e.data || {};
  switch (e.name) {
    case 'uploaded':
      return `photos uploaded (${d.photos ?? '?'} · ${d.tier ?? 'trail'})`;
    case 'tier_changed':
      return `tier changed → ${String(d.tier)}`;
    case 'reclue':
      return 'clues re-derived with your notes';
    case 'world_source':
      return 'world source photo picked';
    case 'sealed':
      return `sealed — recipient link issued (${String(d.tier ?? '')})`;
    case 'paid':
      return `payment confirmed (${String(d.tier ?? '')})`;
    case 'pack_created':
      return 'set pack created — 3 hunts on one purchase';
    case 'revoked':
      return 'recipient link revoked';
    case 'deleted':
      return 'gift deleted';
    case 'opened':
      return 'recipient opened the link';
    case 'unlocked':
      return 'keepsake unlocked 🎉';
    case 'shared_back':
      return `note sent back to you 💛 (${d.looks ?? 0} looks · ${d.mins ?? 0} min)`;
    default: {
      const m = e.name.match(/^round_(\d+)_picked$/);
      if (m) return `round ${m[1]} — ${d.correct ? 'right answer' : 'a look'} (look ${d.attempts ?? 1})`;
      return e.name.replace(/_/g, ' ');
    }
  }
}

function fmtAt(at?: string): string {
  if (!at) return '';
  try {
    return new Date(at.replace(' ', 'T') + 'Z').toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return at;
  }
}

/**
 * The giver's side — `/?g=<giftId>` (the id is the bearer capability; the
 * query is stripped into state on load so it never lingers in history or
 * leaks via Referer). Shows link status, recipient progress (derived from
 * funnel events), the event feed, and manage actions. Polls with backoff
 * so a giver watching live sees rounds land without refreshing.
 */
export function Dash({ giftId, onHome }: DashProps) {
  const [ov, setOv] = useState<GiftOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [gone, setGone] = useState(false); // deleted
  const [revoking, setRevoking] = useState(false);
  const timerRef = useRef<number | null>(null);
  const delayRef = useRef(6000);

  const load = useCallback(async () => {
    try {
      const o = await getGiftOverview(giftId);
      setOv(o);
      setError(null);
      delayRef.current = Math.min(delayRef.current + 4000, 30000); // backoff to 30s
    } catch {
      setError('could not load this gift — the link may be wrong or the gift deleted');
    }
    timerRef.current = window.setTimeout(load, delayRef.current);
  }, [giftId]);

  useEffect(() => {
    void load();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [load]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked */ }
  };

  const revoke = async () => {
    if (!window.confirm('Close this gift link? It will stop opening immediately. This cannot be undone.')) return;
    setRevoking(true);
    try {
      await revokeTrail(giftId);
      logGiftEvent(giftId, 'dash_revoke');
      await load();
    } catch { /* shown on next poll */ }
    setRevoking(false);
  };

  const remove = async () => {
    if (!window.confirm('delete this gift for good? the link, photos, world and events are erased — this cannot be undone.')) return;
    try {
      await deleteGift(giftId);
      setGone(true);
    } catch { /* leave the error visible */ }
  };

  const resume = () => {
    try {
      if (ov) {
        localStorage.setItem(
          'enigmagift.gift.v1',
          JSON.stringify({
            id: ov.gift.id,
            direction: ov.gift.direction ?? 'someone',
            mode: ov.gift.mode,
            tier: ov.gift.tier ?? 'trail',
          }),
        );
      }
    } catch { /* private mode */ }
    window.location.href = '/?resume=1';
  };

  const g = ov?.gift;
  const link = ov?.trail ? `${window.location.origin}${ov.trail.url}` : null;
  const sealed = !!ov?.trail || g?.status === 'sealed' || g?.status === 'paid';
  const events = ov?.events ?? [];
  const shown = events.slice(-14).reverse();

  return (
    <section className="scene scene-dash">
      <div className="scene-inner dash-inner">
        <p className="kicker">the giver’s side</p>
        <h2 className="scene-title">your gift</h2>
        {g && (
          <p className="lede dash-lede">
            {TIER_LABEL[g.tier ?? 'trail'] ?? g.tier ?? ''} ·{' '}
            {g.direction === 'me' ? 'for future-you' : 'for someone'} ·{' '}
            <span className={`dash-status dash-status-${g.paid ? 'paid' : g.status}`}>
              {g.paid ? 'paid & sealed' : g.status}
            </span>
          </p>
        )}

        {error && !ov && <p className="round-nudge is-visible">{error}</p>}
        {gone && (
          <p className="lede">deleted — gone for good. <a className="demo-link" href="/">make another →</a></p>
        )}

        {ov && !gone && (
          <>
            {/* the recipient link */}
            {link ? (
              <div className="dash-card">
                <p className="kicker">link to share</p>
                <div className="dash-link-row">
                  <span className="dash-link mono">{link}</span>
                  <button className="seal-copy" onClick={() => void copy(link)}>
                    {copied ? 'copied' : 'copy'}
                  </button>
                  <a className="demo-link" href={ov.trail!.url} target="_blank" rel="noreferrer">
                    see what they see →
                  </a>
                </div>
                <div className="dash-qr">
                  <QRCode value={link} className="qr-glyph qr-glyph-lg" />
                  <span className="mono dash-qr-note">scans straight to the trail</span>
                </div>
                {ov.trail!.expiresAt && (
                  <p className="mono dash-note">expires {fmtAt(ov.trail!.expiresAt)}</p>
                )}
                {ov.gift.worldStatus !== 'ready' && (
                  <p className="mono dash-note">
                    3d world of the place: {ov.gift.worldStatus} — it finishes on its own
                  </p>
                )}
              </div>
            ) : sealed ? (
              <div className="dash-card">
                <p className="kicker">gift link closed</p>
                <p className="lede">the trail no longer opens for anyone.</p>
              </div>
            ) : (
              <div className="dash-card">
                <p className="kicker">not sealed yet</p>
                <p className="lede">finish building it and this page becomes the live link.</p>
                <button className="btn btn-primary" onClick={resume}>
                  keep making it →
                </button>
              </div>
            )}

            {/* recipient progress */}
            {ov.stats && (ov.stats.opened > 0 || ov.stats.picks.length > 0 || ov.stats.sharedBack || ov.stats.unlocked) && (
              <div className="dash-card">
                <p className="kicker">what happened</p>
                <ul className="dash-stats">
                  {ov.stats.opened > 0 && <li>link opened ×{ov.stats.opened}</li>}
                  {ov.stats.picks.map((p, i) => (
                    <li key={i}>
                      round {p.round} — {p.correct ? `right on look ${p.attempts}` : `a look (${p.attempts})`}
                    </li>
                  ))}
                  {ov.stats.unlocked && <li>keepsake unlocked 🎉</li>}
                  {ov.stats.sharedBack && (
                    <li>note sent back to you 💛 {ov.stats.looks ?? 0} looks · {ov.stats.mins ?? 0} min</li>
                  )}
                </ul>
              </div>
            )}

            {/* event feed */}
            {shown.length > 0 && (
              <div className="dash-card">
                <p className="kicker">everything, in order</p>
                <ul className="dash-events mono">
                  {shown.map((e, i) => (
                    <li key={i}>
                      <span>{humanEvent(e)}</span>
                      <span className="dash-event-at">{fmtAt(e.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* pack credits for The Set */}
            {ov.pack && (
              <div className="dash-card">
                <p className="kicker">the set</p>
                <p className="lede">{ov.pack.creditsLeft} of 3 hunts left on this purchase.</p>
              </div>
            )}

            {/* manage */}
            <div className="seal-manage dash-manage">
              <span className="seal-manage-actions">
                {ov.trail && (
                  <button className="demo-link" onClick={() => void revoke()} disabled={revoking}>
                    {revoking ? 'closing…' : 'close gift link'}
                  </button>
                )}
                <button className="demo-link seal-danger" onClick={() => void remove()}>
                  delete gift
                </button>
                <a className="demo-link" href="/privacy" target="_blank" rel="noreferrer">
                  what’s stored
                </a>
              </span>
              <TrustRow icon="🔒">
                this page is yours alone — the gift id in the link is the only key, so
                don’t paste it anywhere public
              </TrustRow>
            </div>

            <div className="dash-cta">
              <button className="demo-link" onClick={onHome}>
                ← make another gift
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { apiHealthy, createGift, getGift, getTrail, logGiftEvent, stashPack, tokenFromUrl, unstashPack, updateGiftTier } from './lib/api';
import type { Gift, GiftDirection, GiftMode, HideSpot, Tier, Trail } from './lib/types';

import { Door } from './scenes/Door';
import { WatchIt } from './scenes/WatchIt';
import { Reading } from './scenes/Reading';
import { Editor } from './scenes/Editor';
import { Letter } from './scenes/Letter';
import { Hide } from './scenes/Hide';
import { Seal } from './scenes/Seal';
import { Round } from './scenes/Round';
import { Reveal } from './scenes/Reveal';
import { Dash } from './scenes/Dash';

/* Stripe return: checkout opens in a new tab, so the gift context lives in
   localStorage (shared across tabs on this origin) — ?paid=1 resumes at Seal. */
const GIFT_KEY = 'enigmagift.gift.v1';

function stashGift(id: string, direction: GiftDirection, mode: GiftMode, tier: Tier | null) {
  try {
    localStorage.setItem(GIFT_KEY, JSON.stringify({ id, direction, mode, tier }));
  } catch { /* private mode — paid return just won't resume */ }
}

function unstashGift(): { id: string; direction: GiftDirection; mode: GiftMode; tier: Tier | null } | null {
  try {
    const raw = localStorage.getItem(GIFT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { id?: string; direction?: GiftDirection; mode?: GiftMode; tier?: Tier | null };
    return p.id
      ? {
          id: p.id,
          direction: p.direction === 'me' ? 'me' : 'someone',
          mode: p.mode === 'physical' ? 'physical' : 'digital',
          tier: p.tier === 'hide' || p.tier === 'set' || p.tier === 'trail' ? p.tier : null,
        }
      : null;
  } catch {
    return null;
  }
}



export type SceneId =
  | 'door'
  | 'watch'
  | 'reading'
  | 'editor'
  | 'letter'
  | 'hide'
  | 'seal'
  | 'r1'
  | 'r2'
  | 'r3'
  | 'reveal'
  | 'dash';

export type Direction = GiftDirection;

export default function App() {
  // ?miniature=1 is a direct demo link to the authored sample — only when no
  // real gift token and no Stripe paid return is in play.
  const [scene, setScene] = useState<SceneId>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('g') && !tokenFromUrl()) return 'dash';
    return !tokenFromUrl() && !params.has('paid') && params.get('miniature') === '1' ? 'reveal' : 'door';
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [demo, setDemo] = useState(false);
  const [direction, setDirection] = useState<Direction>('someone');
  // tier/mode — The Trail (digital) is the default; The Hide adds the physical code
  const [mode, setMode] = useState<GiftMode>('digital');
  const [tier, setTier] = useState<Tier>('trail');
  const [kept, setKept] = useState(3);

  // live-api state — all null in demo/offline mode
  const [live, setLive] = useState(false);
  const [giftId, setGiftId] = useState<string | null>(null);
  const [gift, setGift] = useState<Gift | null>(null);
  const [hideSpot, setHideSpot] = useState<HideSpot | null>(null);
  const [trail, setTrail] = useState<Trail | null>(null);
  // true when this session is a recipient who opened a sealed link (?t=)
  const [recipient, setRecipient] = useState(false);
  // giver dashboard — /?g=<giftId> opens the owner view for one gift
  const [dashId, setDashId] = useState<string | null>(null);

  const go = useCallback((s: SceneId) => {
    window.scrollTo(0, 0);
    // Phase 3 — scenes live in history, so browser Back (an iOS swipe)
    // returns to the previous scene instead of leaving the site mid-flow.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('s', s);
      window.history.pushState({ scene: s }, '', url);
    } catch { /* private mode quirks — Back just leaves, as before */ }
    setScene(s);
  }, []);

  // popstate: Back/Forward moves between scenes rather than out of the app
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = (e.state?.scene as SceneId | undefined) ?? null;
      if (s) {
        window.scrollTo(0, 0);
        setScene(s);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // true when the door is opened again from the tour's "make one" — the door
  // then lands on the dropzone rather than replaying the hero.
  const [fromTour, setFromTour] = useState(false);

  // Phase 4 — referral: capture ?ref=<trail token> once, then strip it from
  // the URL so it doesn't leak via Referer. The token is validated server-side.
  const refRef = useRef<string | null>(null);
  const readRef = useCallback(() => {
    if (refRef.current !== null) return refRef.current;
    try {
      const url = new URL(window.location.href);
      const r = url.searchParams.get('ref');
      refRef.current = r && /^[A-Za-z0-9_-]{6,64}$/.test(r) ? r : null;
      if (refRef.current) {
        url.searchParams.delete('ref');
        window.history.replaceState(null, '', url);
      }
    } catch {
      refRef.current = null;
    }
    return refRef.current;
  }, []);

  // smooth scroll (Lenis) — scenes that overflow still glide
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  // recipient entry: a sealed link opens with ?t=token → load the trail and
  // jump straight to round one. Without this the link would land on the Door.
  useEffect(() => {
    const token = tokenFromUrl();
    if (!token) return;
    let dead = false;
    getTrail(token)
      .then((t) => {
        if (dead) return;
        setRecipient(true);
        setDemo(false);
        setLive(false);
        setTrail(t);
        go('r1');
      })
      .catch(() => {
        // unknown/expired token — stay on the Door, no crash
        if (!dead) go('door');
      });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Giver dashboard entry: /?g=<giftId> → owner view. The id is a bearer
  // capability, so strip it out of the URL immediately (history / Referer).
  useEffect(() => {
    if (tokenFromUrl()) return; // recipient link wins
    const params = new URLSearchParams(window.location.search);
    const g = params.get('g');
    if (!g || !/^[A-Za-z0-9_-]+$/.test(g)) return;
    try {
      const clean = new URL(window.location.href);
      clean.search = '';
      window.history.replaceState(null, '', clean.pathname + clean.hash);
    } catch { /* private mode */ }
    setDashId(g);
    go('dash');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Builder resume: /?resume=1 → pick the stashed gift back up where it left
  // off (used by the dashboard's "continue building"). Also stripped.
  useEffect(() => {
    if (tokenFromUrl()) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('resume') !== '1') return;
    try {
      const clean = new URL(window.location.href);
      clean.search = '';
      window.history.replaceState(null, '', clean.pathname + clean.hash);
    } catch { /* private mode */ }
    const stashed = unstashGift();
    if (!stashed) return;
    let dead = false;
    getGift(stashed.id)
      .then((g) => {
        if (dead || !g) return;
        setDirection(g.direction ?? stashed.direction);
        setMode(g.mode === 'physical' ? 'physical' : stashed.mode);
        setTier((g.tier as Tier) || stashed.tier || 'trail');
        setGiftId(g.id);
        setGift(g);
        setLive(true);
        setDemo(false);
        if (g.packId) stashPack(g.packId);
        // sealed/paid gifts resume at the seal (link + manage); a ready
        // draft resumes at the editor; a still-reading one at the reading
        go(g.status === 'reading' ? 'reading' : g.status === 'ready' ? 'editor' : 'seal');
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Stripe return lands in a fresh tab at ?paid=1&sid=… — the gift context was
  // stashed in localStorage when the gift was created. Resume at the Seal,
  // which sees paid=1 and finalizes (mark-paid + seal) on its own. The sid is
  // moved to sessionStorage and the query is stripped immediately so it never
  // lingers in browser history or leaks via Referer.
  useEffect(() => {
    if (tokenFromUrl()) return; // recipient link wins
    const params = new URLSearchParams(window.location.search);
    if (params.get('paid') !== '1') return;
    try {
      const sid = params.get('sid');
      if (sid) sessionStorage.setItem('eg_sid', sid);
      sessionStorage.setItem('eg_paid', '1');
      const clean = new URL(window.location.href);
      clean.search = '';
      window.history.replaceState(null, '', clean.pathname + clean.hash);
    } catch { /* private mode — Seal falls back to reading the URL */ }
    const stashed = unstashGift();
    if (!stashed) return;
    let dead = false;
    getGift(stashed.id)
      .then((g) => {
        if (dead || !g) return;
        setDirection(stashed.direction);
        setMode(g.mode === 'physical' ? 'physical' : stashed.mode);
        setTier((g.tier as Tier) || stashed.tier || 'trail');
        setGiftId(stashed.id);
        setGift(g);
        setLive(true);
        setDemo(false);
        if (g.packId) stashPack(g.packId);
        go('seal');
      })
      .catch(() => {});
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePhotos = useCallback(
    async (files: File[]) => {
      const urls = files.map((f) => URL.createObjectURL(f));
      setDemo(false);
      setFromTour(false);
      setPhotos(urls);
      setGift(null);
      setGiftId(null);
      setHideSpot(null);
      setTrail(null);
      setLive(false);

      // try the real backend first — never hard-fail the user
      try {
        if (await apiHealthy()) {
          // a Set pack's later hunts are individual trail/hide gifts
          const packId = unstashPack();
          const effectiveTier: Tier = packId ? (mode === 'physical' ? 'hide' : 'trail') : tier;
          const created = await createGift(files, direction, {
            mode,
            tier: effectiveTier,
            packId,
            // Phase 4 — the referral loop, finally plugged in: a recipient who
            // arrived via ?ref=<token> and made their own gift is attributed
            ref: readRef(),
          });
          stashGift(created.giftId, direction, mode, effectiveTier);
          setGiftId(created.giftId);
          setLive(true);
          go('reading');
          return;
        }
      } catch {
        /* fall through to the offline demo read */
      }
      go('reading');
    },
    [direction, mode, tier, go],
  );

  // tier pick drives mode: only The Hide is physical. For a live, unsealed
  // gift we also persist it server-side so a refresh mid-flow doesn't lose it.
  const handleTier = useCallback(
    (t: Tier) => {
      setTier(t);
      const m: GiftMode = t === 'hide' ? 'physical' : 'digital';
      setMode(m);
      // A hunt spawned from a Set was paid for inside that pack, so the server
      // refuses to turn it into a set purchase — don't offer what it will
      // reject, and don't sync a tier the gift can't own.
      const upgradable = live && giftId && !(t === 'set' && gift?.packId);
      if (upgradable) {
        void updateGiftTier(giftId, t, m).catch(() => {
          /* local state already moved; server sync is best-effort here */
        });
      }
    },
    [live, giftId, gift?.packId],
  );

  // "watch it work" — the payoff, self-playing, before they upload anything
  const handleWatch = useCallback(() => {
    go('watch');
  }, [go]);

  // the tour's "make one" — they've felt it, now they build. Back to the door,
  // where the dropzone is the obvious next step.
  const handleBuild = useCallback(
    (d: Direction) => {
      setDirection(d);
      setFromTour(true);
      go('door');
    },
    [go],
  );

  // Reading finished — the live gift (when the poll caught it) goes to the editor
  const handleRead = useCallback(
    (g?: Gift) => {
      setGift(g ?? null);
      go('editor');
    },
    [go],
  );

  // Editor approved the clues — the giver writes the letter next, then a
  // digital gift seals; only The Hide has a physical thing to hide.
  const handleEditorSeal = useCallback(
    (n: number, spot: HideSpot | null) => {
      setKept(n);
      setHideSpot(spot);
      if (giftId) logGiftEvent(giftId, 'editor_done', { kept: n, mode });
      go('letter');
    },
    [go, mode, giftId],
  );

  // The letter is written and saved — digital gifts go straight to the seal,
  // The Hide takes the physical detour first.
  const handleLetterDone = useCallback(() => {
    go(mode === 'digital' ? 'seal' : 'hide');
  }, [go, mode]);

  // Hide done ("i've hidden it" or "later") — on to the seal
  const handleHidden = useCallback(() => {
    if (giftId) logGiftEvent(giftId, 'hidden', null);
    go('seal');
  }, [go, giftId]);

  // Open the giver’s preview; this does not send the gift.
  const handleSend = useCallback(
    async (token: string | null) => {
      if (token) {
        try {
          setTrail(await getTrail(token));
        } catch {
          setTrail(null); // preview falls back to the scripted rounds
        }
      } else {
        setTrail(null);
      }
      // A Set's pack is minted when the money lands, which just happened —
      // pick it up now so the rest of the pack is usable without a reload.
      if (live && giftId) {
        getGift(giftId)
          .then((g) => { if (g?.packId) stashPack(g.packId); })
          .catch(() => { /* best-effort — the resume path stashes it later */ });
      }
      go('r1');
    },
    [go, live, giftId],
  );

  // the recipient opened a real link (live=false for them) — real trail, not the mock
  const trailDemo = demo || (!live && !recipient);

  return (
    <>
      <div className="grain" aria-hidden />
      <div className="vignette" aria-hidden />

      {scene === 'door' && (
        <Door
          onPhotos={handlePhotos}
          onWatch={handleWatch}
          direction={direction}
          onDirection={setDirection}
          tier={tier}
          onTier={handleTier}
          initialSection={fromTour ? 'start' : 'hero'}
        />
      )}
      {scene === 'watch' && (
        <WatchIt onBack={() => go('door')} onBuild={handleBuild} />
      )}
      {scene === 'reading' && (
        <Reading
          demo={demo}
          giftId={live ? giftId : null}
          offline={!live && !demo}
          photoCount={photos.length || 8}
          preview={photos}
          onDone={handleRead}
        />
      )}
      {scene === 'editor' && (
        <Editor
          demo={demo || !live || !gift}
          gift={live ? gift : null}
          mode={mode}
          onSeal={handleEditorSeal}
        />
      )}
      {scene === 'letter' && (
        <Letter
          demo={!live || !giftId}
          gift={live ? gift : null}
          giftId={live ? giftId : null}
          direction={direction}
          mode={mode}
          kept={kept}
          onNext={handleLetterDone}
        />
      )}
      {scene === 'hide' && (
        <Hide
          demo={demo || !live}
          giftId={live ? giftId : null}
          hideSpot={hideSpot}
          preview={photos}
          onDone={handleHidden}
        />
      )}
      {scene === 'seal' && (
        <Seal
          demo={trailDemo}
          giftId={live ? giftId : null}
          kept={kept}
          tier={tier}
          mode={mode}
          onSend={handleSend}
          packOwned={!!gift?.packId}
          onTier={handleTier}
        />
      )}
      {scene === 'r1' && (
        <Round
          round={1}
          demo={trailDemo}
          trail={trail}
          onDone={() => (trail && trail.rounds.length < 2 ? go('reveal') : go('r2'))}
        />
      )}
      {scene === 'r2' && (
        <Round
          round={2}
          demo={trailDemo}
          trail={trail}
          onDone={() => (trail && trail.rounds.length < 3 ? go('reveal') : go('r3'))}
        />
      )}
      {scene === 'r3' && (
        <Round round={3} demo={trailDemo} trail={trail} onDone={() => go('reveal')} />
      )}
      {scene === 'reveal' && (
        <Reveal demo={trailDemo} trail={trail} direction={direction} />
      )}
      {scene === 'dash' && dashId && (
        <Dash giftId={dashId} onHome={() => go('door')} />
      )}
    </>
  );
}

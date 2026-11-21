import { useCallback, useEffect, useState } from 'react';
import Lenis from 'lenis';
import { apiHealthy, createGift, getGift, getTrail, logGiftEvent, stashPack, tokenFromUrl, unstashPack } from './lib/api';
import type { Gift, GiftDirection, GiftMode, HideSpot, Tier, Trail } from './lib/types';

import { Door } from './scenes/Door';
import { WatchIt } from './scenes/WatchIt';
import { Reading } from './scenes/Reading';
import { Editor } from './scenes/Editor';
import { Hide } from './scenes/Hide';
import { Seal } from './scenes/Seal';
import { Round } from './scenes/Round';
import { Reveal } from './scenes/Reveal';

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
  | 'hide'
  | 'seal'
  | 'r1'
  | 'r2'
  | 'r3'
  | 'reveal';

export type Direction = GiftDirection;

export default function App() {
  // ?miniature=1 is a direct demo link to the authored sample — only when no
  // real gift token and no Stripe paid return is in play.
  const [scene, setScene] = useState<SceneId>(() => {
    const params = new URLSearchParams(window.location.search);
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

  const go = useCallback((s: SceneId) => {
    window.scrollTo(0, 0);
    setScene(s);
  }, []);

  // true when the door is opened again from the tour's "make one" — the door
  // then lands on the dropzone rather than replaying the hero.
  const [fromTour, setFromTour] = useState(false);

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


  // Stripe return lands in a fresh tab at ?paid=1 — the gift context was
  // stashed in localStorage when the gift was created. Resume at the Seal,
  // which sees paid=1 and finalizes (mark-paid + seal) on its own.
  useEffect(() => {
    if (tokenFromUrl()) return; // recipient link wins
    const params = new URLSearchParams(window.location.search);
    if (params.get('paid') !== '1') return;
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

  // tier pick drives mode: only The Hide is physical
  const handleTier = useCallback(
    (t: Tier) => {
      setTier(t);
      setMode(t === 'hide' ? 'physical' : 'digital');
    },
    [],
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

  // Editor approved the clues — digital gifts (The Trail) go straight to the
  // seal; only The Hide has a physical thing to hide
  const handleEditorSeal = useCallback(
    (n: number, spot: HideSpot | null) => {
      setKept(n);
      setHideSpot(spot);
      if (giftId) logGiftEvent(giftId, 'editor_done', { kept: n, mode });
      if (mode === 'digital') {
        go('seal');
      } else {
        go('hide');
      }
    },
    [go, mode, giftId],
  );

  // Hide done ("i've hidden it" or "later") — on to the seal
  const handleHidden = useCallback(() => {
    if (giftId) logGiftEvent(giftId, 'hidden', null);
    go('seal');
  }, [go, giftId]);

  // Seal sent — a real token means a real trail to preview
  const handleSend = useCallback(
    async (token: string | null) => {
      if (token) {
        try {
          setTrail(await getTrail(token));
        } catch {
          setTrail(null); // preview falls back to the scripted rounds
        }
        if (giftId) logGiftEvent(giftId, 'sent', { tier });
      } else {
        setTrail(null);
      }
      go('r1');
    },
    [go, giftId, tier],
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
        />
      )}
      {scene === 'r1' && (
        <Round round={1} demo={trailDemo} trail={trail} onDone={() => go('r2')} />
      )}
      {scene === 'r2' && (
        <Round round={2} demo={trailDemo} trail={trail} onDone={() => go('r3')} />
      )}
      {scene === 'r3' && (
        <Round round={3} demo={trailDemo} trail={trail} onDone={() => go('reveal')} />
      )}
      {scene === 'reveal' && (
        <Reveal demo={trailDemo} trail={trail} direction={direction} />
      )}
    </>
  );
}

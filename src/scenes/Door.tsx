import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion } from '../lib/motion';
import {
  WorldBackdrop,
  type WorldBackdropHandle,
} from '../components/WorldBackdrop';
import { getPack, unstashPack, type Tier } from '../lib/api';
import { TrustRow } from '../components/TrustRow';
import type { Direction } from '../App';

const isFileDrag = (e: DragEvent) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

interface DoorProps {
  onPhotos: (files: File[]) => void;
  onWatch: () => void;
  direction: Direction;
  onDirection: (d: Direction) => void;
  /** chosen tier — trail £4.99 (digital, default) · hide £9.99 (physical) · set £19 (pack of 3) */
  tier: Tier;
  onTier: (t: Tier) => void;
  /** land on the dock (after the story's "make one") rather than the cold-open */
  initialSection?: 'hero' | 'start';
}

const TIER_HINT: Record<Tier, { someone: string; me: string }> = {
  trail: {
    someone: 'One digital gift · send a link · no physical hiding',
    me: 'One digital keepsake · no physical hiding',
  },
  hide: {
    someone: 'you hide something real at the place, with the code inside',
    me: 'hide something for future-you at the place — the code opens the keepsake',
  },
  set: {
    someone: 'three hunts from one purchase — for different people',
    me: 'three hunts from one purchase — one for each future occasion',
  },
};

/**
 * The landing — one scene, one place, almost no words. A single photograph
 * of the place lifts into its 3D world on a slow loop behind everything;
 * the product's own words ("round 1", "hidden here", "the keepsake") float
 * on the world, so the backdrop shows the product instead of describing it.
 * The dock — drop photos + for whom — is the only move the page offers.
 */
export function Door({
  onPhotos,
  onWatch,
  direction,
  onDirection,
  tier,
  onTier,
  initialSection = 'hero',
}: DoorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<WorldBackdropHandle>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const [tableDrag, setTableDrag] = useState(false);
  const [hintPos, setHintPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileNotice, setFileNotice] = useState('');
  const [starting, setStarting] = useState(false);
  const startTimer = useRef<number | null>(null);
  const previewUrls = useRef<string[]>([]);
  const startingRef = useRef(false);
  const [phase, setPhase] = useState<'photo' | 'world'>('photo');
  const [dockPulse, setDockPulse] = useState(false);
  // an active Set pack (from a previous £19 purchase) — this hunt comes out of it
  const [packCredits, setPackCredits] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const count = selectedFiles.length;

  useEffect(
    () => () => {
      if (startTimer.current !== null) window.clearTimeout(startTimer.current);
      previewUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  useEffect(() => {
    const id = unstashPack();
    if (!id) return;
    getPack(id)
      .then((p) => setPackCredits(p.creditsLeft))
      .catch(() => setPackCredits(null));
  }, []);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length || startingRef.current) return;
    const images = Array.from(files).filter(
      (f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name),
    );
    if (!images.length) {
      setFileNotice('Choose image files to add to your trail.');
      return;
    }
    setSelectedFiles((previous) => {
      const unique = [...previous];
      for (const image of images) {
        if (
          !unique.some(
            (f) =>
              f.name === image.name &&
              f.size === image.size &&
              f.lastModified === image.lastModified,
          )
        )
          unique.push(image);
      }
      return unique.slice(0, 12);
    });
    setFileNotice('Up to 12 photos per trail.');
  }, []);

  const startTrail = () => {
    // Phase 3 — one photo is enough: the trail degrades honestly (fewer
    // rounds, throughline as the only puzzle). The old 5-photo floor served
    // the pipeline, not the gift.
    if (startingRef.current || selectedFiles.length < 1 || !consent) return;
    startingRef.current = true;
    setStarting(true);
    previewUrls.current = selectedFiles
      .slice(0, 5)
      .map((f) => URL.createObjectURL(f));
    backdropRef.current?.scatter(previewUrls.current);
    startTimer.current = window.setTimeout(
      () => onPhotos(selectedFiles),
      prefersReducedMotion() ? 250 : 900,
    );
  };

  /* drop anywhere over the page */
  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepth.current += 1;
      setTableDrag(true);
    };
    const onOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setHintPos({ x: e.clientX, y: e.clientY });
    };
    const onLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) {
        setTableDrag(false);
        setHintPos(null);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setTableDrag(false);
      setHintPos(null);
      handleFiles(e.dataTransfer?.files ?? null);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFiles]);

  /* returning from the story — the dock is where they go */
  useEffect(() => {
    if (initialSection !== 'start') return;
    setDockPulse(true);
    const t = window.setTimeout(() => setDockPulse(false), 2600);
    const raf = requestAnimationFrame(() => {
      dockRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'end',
      });
    });
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [initialSection]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.door-anim', { opacity: 1, y: 0 });
        return;
      }
      gsap.from('.door-anim', {
        opacity: 0,
        y: 18,
        duration: 1,
        ease: 'power3.out',
        stagger: 0.14,
        delay: 0.2,
        clearProps: 'all',
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const openPicker = () => inputRef.current?.click();

  return (
    <section className="scene scene-door" ref={rootRef}>
      {/* the world behind everything — one photograph, its 3D world */}
      <div className="door-stage">
        <WorldBackdrop
          ref={backdropRef}
          dragActive={tableDrag}
          onPhase={setPhase}
        />
        <div className="door-scrim" aria-hidden />

        {tableDrag && hintPos && (
          <div
            className="drop-hint"
            style={{ left: hintPos.x, top: hintPos.y }}
            aria-hidden="true"
          >
            spread them on the table
          </div>
        )}

        {/* the words — bottom-left, over the world */}
        <div className="door-copy">
          <p className="kicker door-anim">
            {direction === 'me'
              ? 'a place worth remembering.'
              : 'a place you share. a gift to discover.'}
          </p>
          <h1 className="wordmark door-anim">enigmagift</h1>
          <p className="lede door-anim">
            {tier === 'hide'
              ? direction === 'me'
                ? 'Turn a place that matters into a trail for future-you. Hide a note there; its code opens your digital keepsake.'
                : 'Turn a place you share into a trail of clues. Hide a note there; its code opens their digital keepsake.'
              : direction === 'me'
                ? 'Turn photographs of a place that matters into a short trail of clues and a digital keepsake. Nothing to hide or collect.'
                : 'Turn photographs of a place you share into a short trail of clues and a digital keepsake. Send a link — nothing to hide or collect.'}
          </p>
          <div className="hero-actions door-anim">
            <button className="btn btn-primary" onClick={onWatch}>
              watch it work
            </button>
          </div>
        </div>

        {/* the move — a glass dock on the world */}
        <div
          ref={dockRef}
          className={`door-dock door-anim${dockPulse ? ' is-pulse' : ''}`}
        >
          <button
            type="button"
            className={`dock-drop${tableDrag ? ' is-dragging' : ''}`}
            disabled={starting}
            onClick={openPicker}
          >
            <span className="dock-glyph" aria-hidden>
              ↑
            </span>
            <span className="dock-label">
              {count > 0
                ? `Add photos (${count}/12 selected)`
                : 'Choose photos of the place'}
            </span>
            <span className="dock-sub">
              Choose 1–12 photos. One is enough — more make the trail richer.
            </span>
            <span className="dock-shots">
              standing in the place? the five shots that read best: the door,
              a sign or name, where you sat, the view, one small detail.
            </span>
          </button>
          <div className="dock-promise">
            <TrustRow
              icon="🔒"
              more={{
                label: 'how we handle location metadata',
                body: (
                  <>
                    your browser re-encodes each photo before upload, and our
                    server strips EXIF/GPS metadata again before storing.
                    what’s left is just the picture.{' '}
                    <a href="/privacy" target="_blank" rel="noreferrer">details</a>
                  </>
                ),
              }}
            >
              location stripped from every photo
            </TrustRow>
            <TrustRow
              icon="🤖"
              more={{
                label: 'who sees your photos',
                body: (
                  <>
                    our ai providers (listed on the privacy page) read the
                    photos only to build your gift — never sold, never used
                    for ads, never shown to anyone else.{' '}
                    <a href="/privacy" target="_blank" rel="noreferrer">the list</a>
                  </>
                ),
              }}
            >
              read by our ai to build the clues — nothing else
            </TrustRow>
            <TrustRow
              icon="🗑"
              more={{
                label: 'how long we keep things',
                body: (
                  <>
                    drafts that are never sealed delete themselves after 7
                    days. sealed gifts stay until you delete them — one
                    click, gone for good.{' '}
                    <a href="/privacy" target="_blank" rel="noreferrer">retention</a>
                  </>
                ),
              }}
            >
              drafts delete themselves after 7 days
            </TrustRow>
          </div>
          <label className="dock-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={starting}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              i can share these photos — everyone in them knows ·{' '}
              <a href="/privacy" target="_blank" rel="noreferrer">privacy</a>
            </span>
          </label>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            hidden
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {count > 0 && (
            <p className="dock-files">
              {count} photo{count === 1 ? '' : 's'} selected ·{' '}
              <button
                type="button"
                className="link"
                disabled={starting}
                onClick={() => {
                  setSelectedFiles([]);
                  setFileNotice('');
                }}
              >
                Clear selection
              </button>
            </p>
          )}
          <div
            className="seg dock-seg"
            role="group"
            aria-label="who is this gift for"
          >
            <button
              className={direction === 'someone' ? 'is-active' : ''}
              aria-pressed={direction === 'someone'}
              disabled={starting}
              onClick={(e) => {
                e.stopPropagation();
                onDirection('someone');
              }}
            >
              for someone
            </button>
            <button
              className={direction === 'me' ? 'is-active' : ''}
              aria-pressed={direction === 'me'}
              disabled={starting}
              onClick={(e) => {
                e.stopPropagation();
                onDirection('me');
              }}
            >
              for me
            </button>
          </div>
          <div
            className="seg dock-seg dock-tier"
            role="group"
            aria-label="which gift"
          >
            {/* Phase 3 — the door ships one default. Tier selection moved to
                the Seal, where the buyer has felt the trail and is choosing
                an ending. "Other ways" stays here for discovery. */}
            <button
              className={tier === 'trail' ? 'is-active' : ''}
              aria-pressed={tier === 'trail'}
              disabled={starting}
              onClick={(e) => {
                e.stopPropagation();
                onTier('trail');
              }}
            >
              the trail · £4.99
            </button>
            <button
              aria-expanded={tier !== 'trail'}
              disabled={starting}
              onClick={(e) => {
                e.stopPropagation();
                onTier(tier === 'trail' ? 'hide' : 'trail');
              }}
            >
              {tier === 'trail' ? 'other ways to give →' : '← back to the trail'}
            </button>
          </div>
          {tier !== 'trail' && (
            <div className="seg dock-seg dock-tier" role="group" aria-label="other ways to give">
              <button
                className={tier === 'hide' ? 'is-active' : ''}
                aria-pressed={tier === 'hide'}
                disabled={starting}
                onClick={(e) => {
                  e.stopPropagation();
                  onTier('hide');
                }}
              >
                the hide · £9.99
              </button>
              <button
                className={tier === 'set' ? 'is-active' : ''}
                aria-pressed={tier === 'set'}
                disabled={starting}
                onClick={(e) => {
                  e.stopPropagation();
                  onTier('set');
                }}
              >
                the set · £19
              </button>
            </div>
          )}
          <p className="dock-tier-hint">{TIER_HINT[tier][direction]}</p>
          {packCredits != null && packCredits > 0 && (
            <p className="dock-pack-note">
              set pack active — {packCredits} hunt{packCredits === 1 ? '' : 's'}{' '}
              left; this one comes out of the pack
            </p>
          )}
          <p className="dock-status" role="status" aria-live="polite">
            {starting
              ? 'Opening your trail…'
              : count < 1
                ? 'Choose at least one photo of the place to continue.'
                : !consent
                  ? 'Your photos are ready. Confirm you can share them to continue.'
                  : 'Your photos are ready. Build your trail when you are ready.'}
          </p>
          {fileNotice && <p className="dock-status">{fileNotice}</p>}
          <button
            type="button"
            className="btn btn-primary dock-build"
            onClick={startTrail}
            disabled={starting || count < 5 || !consent}
          >
            {starting ? 'Opening…' : 'Build my trail'}
          </button>
        </div>

        {/* the promise, live — tracks the backdrop's photo ⇄ world loop */}
        <div className="door-caption mono" aria-live="polite">
          {phase === 'world' ? (
            <span className="is-on">
              one photograph <span className="door-caption-arrow">→</span> a
              world of it
            </span>
          ) : (
            <span>
              one photograph <span className="door-caption-arrow dim">→</span>{' '}
              a world of it
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

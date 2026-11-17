import { useEffect, useRef, useState } from 'react';

interface HeroFilmProps {
  className?: string;
  /** called once the first frame is visible — lets the parent choreograph */
  onReady?: () => void;
}

/**
 * The cold-open. A short cinematic film — generated from a real EnigmaGift
 * photograph — fills the frame, muted and looping. If the film can't load
 * (not generated yet, or the CDN is down) it degrades to a slow Ken-Burns
 * push on the still frame, so the hero is always alive.
 */
export function HeroFilm({ className = '', onReady }: HeroFilmProps) {
  const [failed, setFailed] = useState(false);
  const readyRef = useRef(false);

  const markReady = () => {
    if (readyRef.current) return;
    readyRef.current = true;
    onReady?.();
  };

  // if the video never produces a frame in time, fall back to the still
  useEffect(() => {
    if (failed) {
      markReady();
      return;
    }
    const t = window.setTimeout(() => setFailed(true), 9000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  if (failed) {
    return (
      <div className={`hero-film hero-film-still ${className}`} aria-hidden>
        <div className="hero-kenburns">
          <img src="/hero.jpg" alt="" draggable={false} />
        </div>
        <div className="hero-scrim" aria-hidden />
      </div>
    );
  }

  return (
    <div className={`hero-film ${className}`} aria-hidden>
      <video
        className="hero-video"
        src="/hero.mp4"
        poster="/hero.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onError={() => setFailed(true)}
        onPlaying={markReady}
      />
      <div className="hero-scrim" aria-hidden />
    </div>
  );
}

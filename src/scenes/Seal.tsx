import { useEffect, useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { SEAL_LINK } from '../data';
import { prefersReducedMotion } from '../lib/motion';
import { WaxSeal } from '../components/WaxSeal';

interface SealProps {
  kept: number;
  onSend: () => void;
}

export function Seal({ kept, onSend }: SealProps) {
  const rootRef = useRef<HTMLElement>(null);
  const sealRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${SEAL_LINK}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const send = () => {
    if (sending) return;
    setSending(true);
    const finish = () => onSend();
    if (prefersReducedMotion() || !sealRef.current) {
      window.setTimeout(finish, 300);
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
      onComplete: () => window.setTimeout(finish, 350),
    });
  };

  return (
    <section className="scene scene-seal" ref={rootRef}>
      <div className="scene-inner seal-inner">
        <div className="seal-anim" ref={sealRef}>
          <WaxSeal size={188} />
        </div>

        <p className="kicker seal-anim">step four — the seal</p>
        <h2 className="scene-title seal-anim">the gift is sealed</h2>
        <p className="lede seal-anim">
          {kept} clue{kept === 1 ? '' : 's'} inside, nothing else. one link, one
          person — send it however you like.
        </p>

        <div className="seal-link seal-anim">
          <span className="seal-link-url">{SEAL_LINK}</span>
          <button className="seal-copy" onClick={copy}>
            {copied ? 'copied' : 'copy'}
          </button>
        </div>

        <div className="seal-qr seal-anim" aria-label="qr code placeholder">
          <svg viewBox="0 0 21 21" className="qr-glyph" aria-hidden>
            <QRPattern />
          </svg>
          <span className="qr-label">scan to open</span>
        </div>

        <button className="btn btn-primary seal-anim" onClick={send} disabled={sending}>
          {sending ? 'sealing…' : 'seal & send'}
        </button>

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
      {[ [0,0], [14,0], [0,14] ].map(([fx, fy]) => (
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

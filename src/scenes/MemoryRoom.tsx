import { useEffect, useRef, useState } from 'react';
import './MemoryRoom.css';

type SpotId = 'lamp' | 'controller' | 'armchair' | 'sofa';

interface Spot {
  id: SpotId;
  label: string;
  left: string;
  top: string;
  memory: string;
  hint: string;
}

const ANSWER: SpotId = 'armchair';
const MAX_MISSES = 3;

const SPOTS: Spot[] = [
  {
    id: 'controller',
    label: 'the game controller',
    left: '46.7%',
    top: '71%',
    memory: 'You always picked player two so I could be first.',
    hint: 'It is something soft enough to sit on.',
  },
  {
    id: 'lamp',
    label: 'the floor lamp',
    left: '73.3%',
    top: '36%',
    memory: 'Mum thought this bulb kept blowing. We just loosened it to play in the dark.',
    hint: 'It is close enough to turn out the light without standing.',
  },
  {
    id: 'armchair',
    label: 'the mustard armchair',
    left: '85%',
    top: '59%',
    memory: "Grandad's seat every Sunday — crossword half done, Werther's wrappers in the cushion.",
    hint: 'The chair nobody else was allowed to sit in.',
  },
  {
    id: 'sofa',
    label: 'the sofa across the room',
    left: '24%',
    top: '52%',
    memory: 'Every cushion a wall, every blanket a roof. Best den on the street.',
    hint: 'It is not the den — it is where the dens were watched from.',
  },
];

const MISS_NUDGES = [
  'Look for a place to sit.',
  'Which seat is within reach of the lamp?',
  'Let me walk you to it — or open your gift whenever you like.',
];

export default function MemoryRoom() {
  const [selected, setSelected] = useState<SpotId | null>(null);
  const [seen, setSeen] = useState<Set<SpotId>>(new Set());
  const [missed, setMissed] = useState<SpotId[]>([]);
  const [opened, setOpened] = useState(false);
  const [revisiting, setRevisiting] = useState(false);
  const [status, setStatus] = useState('Explore the room. Guessing is the only thing that spends a chance.');
  const revealRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const spot = SPOTS.find((s) => s.id === selected) ?? null;
  const guessesLeft = MAX_MISSES - missed.length;
  const guidedOffered = guessesLeft === 0 && !opened;

  useEffect(() => {
    if (opened && revealRef.current) {
      revealRef.current.focus();
    }
  }, [opened]);

  const explore = (id: SpotId) => {
    setSelected(id);
    setRevisiting(opened);
    setSeen((prev) => new Set(prev).add(id));
    const s = SPOTS.find((x) => x.id === id)!;
    setStatus(
      opened
        ? `Revisiting ${s.label}.`
        : `${s.label} — a memory, not a guess. ${guessesLeft} ${guessesLeft === 1 ? 'chance' : 'chances'} left.`,
    );
    if (window.matchMedia('(max-width: 860px)').matches) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      panelRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' });
    }
  };

  const guess = () => {
    if (!spot || opened || guessesLeft === 0) return;
    if (missed.includes(spot.id)) {
      setStatus(`You already tried ${spot.label} — no chance spent twice.`);
      return;
    }
    if (spot.id === ANSWER) {
      setOpened(true);
      setStatus(`Yes — it was tucked behind ${spot.label}.`);
      return;
    }
    const next = [...missed, spot.id];
    setMissed(next);
    const nudge = MISS_NUDGES[Math.min(next.length - 1, MISS_NUDGES.length - 1)];
    const left = MAX_MISSES - next.length;
    setStatus(
      left > 0
        ? `${spot.label} isn't it. ${nudge} ${left} ${left === 1 ? 'chance' : 'chances'} left.`
        : `${spot.label} isn't it. ${nudge}`,
    );
  };

  const openGift = () => {
    setOpened(true);
    setRevisiting(false);
    setStatus('Your gift is open.');
  };

  const revisit = () => {
    setRevisiting(true);
    setStatus('Wander the room again — nothing else is spent.');
    if (statusRef.current) statusRef.current.focus();
  };

  return (
    <main className="mr-room">
      <header className="mr-header">
        <p className="mr-kicker">A memory hunt · For Max, from Jo</p>
        <h1 className="mr-title">The room we grew up in.</h1>
        <p className="mr-lede">
          Somewhere in this room your gift is hiding. Tap the things you remember — every
          one holds a small memory. Only a guess spends a chance, and you have{' '}
          {opened ? 'found it' : `${guessesLeft} ${guessesLeft === 1 ? 'chance' : 'chances'}`}.
        </p>
      </header>

      <div className="mr-layout">
        <figure className="mr-frame">
          <div className="mr-art">
            <img
              src="/memory-room.svg"
              alt="Illustration of the sitting room: window with afternoon light, sofa across the room, mustard armchair beside a floor lamp, game controller on the rug."
            />
            {SPOTS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={[
                  'mr-hot',
                  seen.has(s.id) ? 'is-seen' : '',
                  selected === s.id ? 'is-selected' : '',
                  missed.includes(s.id) ? 'is-missed' : '',
                ].join(' ')}
                style={{ left: s.left, top: s.top }}
                aria-label={`${i + 1}. Explore ${s.label}`}
                aria-pressed={selected === s.id}
                onClick={() => explore(s.id)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <figcaption className="mr-caption">Postcard no. 1 — annotated in Jo's ink.</figcaption>
        </figure>

        <aside className="mr-panel" aria-label="Memory notes" ref={panelRef}>
          <p ref={statusRef} className="mr-status" role="status" aria-live="polite" tabIndex={-1}>
            {status}
          </p>

          {opened && !revisiting ? (
            <div className="mr-reveal" ref={revealRef} tabIndex={-1}>
              <p className="mr-note-kicker">Your gift</p>
              <blockquote className="mr-gift">
                <p>“Saturday rematch. Pizza’s on me.”</p>
                <cite>— Jo</cite>
              </blockquote>
              <p className="mr-note">
                {spot?.id === ANSWER
                  ? 'It was behind the mustard armchair all along, like every good hiding place in that house.'
                  : 'It was tucked behind the mustard armchair — Grandad would have approved.'}
              </p>
              <button type="button" className="mr-btn ghost" onClick={revisit}>
                Wander the room again
              </button>
            </div>
          ) : spot ? (
            <div className="mr-note-card">
              <p className="mr-note-kicker">You found a memory</p>
              <p className="mr-memory">“{spot.memory}”</p>
              <p className="mr-hint">Hint: {spot.hint}</p>
              {!opened && (
                <div className="mr-actions">
                  {guessesLeft > 0 && (
                    <button
                      type="button"
                      className="mr-btn"
                      onClick={guess}
                      disabled={missed.includes(spot.id)}
                    >
                      {missed.includes(spot.id)
                        ? `Already tried: ${spot.label}`
                        : `Guess: ${spot.label}`}
                    </button>
                  )}
                  {guidedOffered && (
                    <button type="button" className="mr-btn accent" onClick={openGift}>
                      Show me where it is
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mr-note-card">
              <p className="mr-note-kicker">How this works</p>
              <p className="mr-note">
                Touch anything numbered and it tells you something only we would know.
                Exploring is free — when you think you know where the gift is, use the
                guess button on that thing.
              </p>
            </div>
          )}

          {!opened && (
            <button type="button" className="mr-skip" onClick={openGift}>
              Open my gift instead
            </button>
          )}

          {opened && revisiting && (
            <button type="button" className="mr-skip" onClick={openGift}>
              Read Jo’s invitation again
            </button>
          )}

          <ol className="mr-index" aria-label="Object index — same as the numbered spots">
            {SPOTS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={selected === s.id ? 'is-selected' : ''}
                  onClick={() => explore(s.id)}
                >
                  <span className="mr-num">{i + 1}</span> {s.label}
                  {missed.includes(s.id) ? ' — tried' : seen.has(s.id) ? ' — remembered' : ''}
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </main>
  );
}

import { useCallback, useEffect, useState } from 'react';
import Lenis from 'lenis';
import { mockGallery } from './data';
import { Door } from './scenes/Door';
import { Reading } from './scenes/Reading';
import { Editor } from './scenes/Editor';
import { Seal } from './scenes/Seal';
import { Round } from './scenes/Round';
import { Reveal } from './scenes/Reveal';

export type SceneId =
  | 'door'
  | 'reading'
  | 'editor'
  | 'seal'
  | 'r1'
  | 'r2'
  | 'r3'
  | 'reveal';

export type Direction = 'someone' | 'me';

export default function App() {
  const [scene, setScene] = useState<SceneId>('door');
  const [photos, setPhotos] = useState<string[]>([]);
  const [demo, setDemo] = useState(false);
  const [direction, setDirection] = useState<Direction>('someone');
  const [kept, setKept] = useState(3);

  const go = useCallback((s: SceneId) => {
    window.scrollTo(0, 0);
    setScene(s);
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

  const handlePhotos = useCallback(
    (urls: string[]) => {
      setDemo(false);
      setPhotos(urls);
      go('reading');
    },
    [go],
  );

  const handleDemo = useCallback(() => {
    setDemo(true);
    setPhotos(mockGallery());
    go('reading');
  }, [go]);

  return (
    <>
      <div className="grain" aria-hidden />
      <div className="vignette" aria-hidden />

      {scene === 'door' && (
        <Door
          onPhotos={handlePhotos}
          onDemo={handleDemo}
          direction={direction}
          onDirection={setDirection}
        />
      )}
      {scene === 'reading' && (
        <Reading photos={photos} onDone={() => go('editor')} />
      )}
      {scene === 'editor' && (
        <Editor
          photos={photos}
          demo={demo}
          onSeal={(n) => {
            setKept(n);
            go('seal');
          }}
        />
      )}
      {scene === 'seal' && <Seal kept={kept} onSend={() => go('r1')} />}
      {scene === 'r1' && (
        <Round round={1} photos={photos} demo={demo} onDone={() => go('r2')} />
      )}
      {scene === 'r2' && (
        <Round round={2} photos={photos} demo={demo} onDone={() => go('r3')} />
      )}
      {scene === 'r3' && (
        <Round round={3} photos={photos} demo={demo} onDone={() => go('reveal')} />
      )}
      {scene === 'reveal' && (
        <Reveal photos={photos} demo={demo} direction={direction} />
      )}
    </>
  );
}

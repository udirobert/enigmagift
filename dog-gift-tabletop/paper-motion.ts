/* One small motion helper shared by the photo pilot and the sample room.
   Every animation is optional: the DOM it decorates is already in its final
   state before play() runs, so cancelling at any moment leaves a settled,
   usable screen. Gestures, viewport changes, OS reduced motion, a zoomed
   viewport or a hidden tab all settle immediately — controls never wait on
   a tween, and no completion callback ever mutates UI state. */

export const PAPER_EASE = 'cubic-bezier(.16,1,.3,1)';

export function createPaperMotion(scope: HTMLElement) {
  const running = new Set<Animation>();
  const ctl = new AbortController();
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;

  const enabled = () =>
    !disposed
    && !media.matches
    && document.visibilityState !== 'hidden'
    && typeof Element.prototype.animate === 'function'
    /* pinch zoom distorts FLIP geometry — settled state instead */
    && (!window.visualViewport || Math.abs(window.visualViewport.scale - 1) < 0.01);

  const settle = () => {
    for (const anim of running) anim.cancel();
    running.clear();
  };

  const play = (
    el: HTMLElement | null,
    frames: Keyframe[],
    options: KeyframeAnimationOptions = {},
  ): Animation | null => {
    if (!enabled() || !el?.isConnected) return null;
    /* assistive activation can skip pointerdown/keydown — replace an older
       move on the same element so its transform can't reappear on cancel */
    for (const old of running) {
      const eff = old.effect as KeyframeEffect | null;
      if (eff && eff.target === el) { old.cancel(); running.delete(old); }
    }
    try {
      const anim = el.animate(frames, {
        duration: 200, easing: PAPER_EASE, fill: 'none', ...options,
      });
      running.add(anim);
      anim.onfinish = () => running.delete(anim);
      anim.oncancel = () => running.delete(anim);
      return anim;
    } catch {
      return null; // animate() threw — the settled DOM is the fallback
    }
  };

  /* capture phase so an in-flight move finishes before the gesture that
     follows it starts its own motion */
  scope.addEventListener('pointerdown', settle, { signal: ctl.signal, capture: true });
  scope.addEventListener('keydown', settle, { signal: ctl.signal, capture: true });
  scope.addEventListener('focusin', settle, { signal: ctl.signal, capture: true });
  window.addEventListener('resize', settle, { signal: ctl.signal });
  window.addEventListener('pagehide', settle, { signal: ctl.signal });
  window.visualViewport?.addEventListener('resize', settle, { signal: ctl.signal });
  window.visualViewport?.addEventListener('scroll', settle, { signal: ctl.signal });
  document.addEventListener('visibilitychange', settle, { signal: ctl.signal });
  media.addEventListener('change', settle, { signal: ctl.signal });

  const destroy = () => {
    disposed = true;
    settle();
    ctl.abort();
  };

  return { play, settle, destroy, enabled };
}

export type Route = 'found' | 'guided' | 'direct';

// One local attempt. No IDs, storage, transmission or rankings.
export function createRun(now = () => performance.now()) {
  let started = false, visible = true, elapsed = 0, since: number | null = null;
  let route: Route | null = null, taps = 0, hints = 0;
  const discoveries = new Set<string>();
  function pause() {
    if (since !== null) elapsed += Math.max(0, now() - since);
    since = null;
  }
  function resume() {
    if (started && visible && !route && since === null) since = now();
  }
  return {
    start(isVisible: boolean) { if (!started) { started = true; visible = isVisible; resume(); } },
    visible(value: boolean) { visible = value; if (value) resume(); else pause(); },
    tap(target?: string | null) {
      if (started && !route) { taps++; if (target) discoveries.add(target); }
    },
    hint() { if (started && !route) hints++; },
    finish(how: Route) { if (started && !route) { pause(); route = how; } },
    recap() {
      return { route, activeMs: elapsed + (since === null ? 0 : Math.max(0, now() - since)),
        taps, hints, discoveries: [...discoveries] };
    },
  };
}

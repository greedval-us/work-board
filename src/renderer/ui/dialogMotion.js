const ENTER_DURATION = 300;
const EXIT_DURATION = 160;
const ENTER_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EXIT_EASING = 'cubic-bezier(0.4, 0, 1, 1)';

/** Native dialog lifecycle with interruptible visual transitions. */
export function createDialogMotion(getElement, options = {}) {
  const media = options.media ?? globalThis.window?.matchMedia('(prefers-reduced-motion: reduce)');
  const readStyle = options.readStyle ?? (element => element.ownerDocument.defaultView.getComputedStyle(element));
  let revision = 0;
  let animation;
  let pending;
  let phase;
  let disposed = false;

  function duration(style, property, fallback) {
    const value = style.getPropertyValue?.(property)?.trim();
    if (!value) return fallback;
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number * (value.endsWith('ms') ? 1 : 1000) : fallback;
  }

  function run(nextPhase) {
    const element = getElement();
    if (disposed || !element) return Promise.resolve(false);
    if (phase === nextPhase && pending) return pending;
    if (!animation && ((nextPhase === 'entering' && element.open) || (nextPhase === 'leaving' && !element.open))) return Promise.resolve(true);

    const current = animation ? readStyle(element) : null;
    const from = current ? { opacity: current.opacity, transform: current.transform } : null;
    const token = ++revision;
    animation?.cancel();
    animation = undefined;
    phase = nextPhase;
    if (nextPhase === 'entering' && !element.open) element.showModal();
    element.dataset.motionState = nextPhase;

    function finish() {
      if (disposed || token !== revision) return false;
      if (nextPhase === 'leaving' && element.open) element.close();
      delete element.dataset.motionState;
      animation = undefined;
      pending = undefined;
      phase = undefined;
      return true;
    }

    if (media?.matches || typeof element.animate !== 'function') return Promise.resolve(finish());
    const style = readStyle(element);
    const entering = nextPhase === 'entering';
    const frames = entering
      ? [from ?? { opacity: 0, transform: 'translate3d(0, 12px, 0) scale(0.975)' }, { opacity: 1, transform: 'none' }]
      : [from ?? { opacity: style.opacity, transform: style.transform }, { opacity: 0, transform: 'translate3d(0, 8px, 0) scale(0.985)' }];
    const effect = element.animate(frames, {
      duration: duration(style, entering ? '--motion-surface-enter' : '--motion-surface-exit', entering ? ENTER_DURATION : EXIT_DURATION),
      easing: style.getPropertyValue?.(entering ? '--motion-ease-out' : '--motion-ease-in')?.trim() || (entering ? ENTER_EASING : EXIT_EASING),
      fill: 'both',
    });
    animation = effect;
    pending = (async () => {
      try { await effect.finished; }
      catch { return false; }
      if (disposed || token !== revision) return false;
      const completed = finish();
      effect.cancel();
      return completed;
    })();
    return pending;
  }

  const preferenceChanged = () => { if (media.matches) animation?.finish(); };
  media?.addEventListener?.('change', preferenceChanged);

  return {
    open: () => run('entering'),
    close: () => run('leaving'),
    dispose() {
      if (disposed) return;
      disposed = true;
      revision++;
      animation?.cancel();
      animation = undefined;
      pending = undefined;
      const element = getElement();
      if (element) {
        delete element.dataset.motionState;
        if (element.open) element.close();
      }
      media?.removeEventListener?.('change', preferenceChanged);
    },
  };
}

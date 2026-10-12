/** Reveal the live opening shot without changing the title backdrop's framing. */
export function playTitleDeparture(screen: HTMLElement, stage: HTMLElement, complete: () => void): () => void {
  const art = screen.querySelector<HTMLElement>('.start-art')!;
  const content = screen.querySelector<HTMLElement>('.start-content')!;
  const credit = screen.querySelector<HTMLElement>('.start-credit')!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 180 : 1800;
  screen.classList.add('start-departing');
  screen.inert = true;
  const fade = { duration: reduced ? duration : 450, easing: 'ease-out', fill: 'forwards' as const };
  const animations = [content, credit].map(element => element.animate(
    [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: reduced ? 'none' : 'translateY(-16px)' }], fade));
  const reveal = { duration, easing: 'ease-in-out', fill: 'forwards' as const };
  for (const layer of [art, stage]) animations.push(layer.animate([
    { filter: 'sepia(1)' }, { filter: 'sepia(0)' },
  ], reveal));
  for (const bar of Array.from(stage.closest('.game-shell')!.querySelectorAll<HTMLElement>('.scene-bar,.inventory-bar'))) {
    animations.push(bar.animate([{ opacity: 0 }, { opacity: 1 }], reveal));
  }
  // CSS uses the same stretch/fit setting as the fullscreen stage. Keeping that
  // geometry throughout the dissolve avoids a crop or aspect-ratio change.
  const dissolve = art.animate([
    { opacity: 1, offset: 0 }, { opacity: 1, offset: reduced ? 0 : .6 }, { opacity: 0, offset: 1 },
  ], { duration, easing: 'ease-in-out', fill: 'forwards' });
  animations.push(dissolve);
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    for (const animation of animations) animation.cancel();
    screen.classList.remove('start-departing');
    screen.inert = false;
  };
  void dissolve.finished.then(() => {
    if (cancelled) return;
    // Hide before resetting the title's animation styles so it cannot flash back.
    screen.hidden = true;
    cancel();
    complete();
  }, () => { /* A new game, load or return to title cancelled the departure. */ });
  return cancel;
}

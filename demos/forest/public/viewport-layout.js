// A blocking head script: establish the visible pane before the first paint,
// independently of the game module graph and its asset/designer dependencies.
(() => {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const update = () => {
    root.style.setProperty('--preview-width', `${viewport?.width ?? window.innerWidth}px`);
    root.style.setProperty('--preview-height', `${viewport?.height ?? window.innerHeight}px`);
    root.style.setProperty('--preview-top', `${viewport?.offsetTop ?? 0}px`);
    // Preserve vertical page scrolling; horizontal framing follows the pane.
    root.style.setProperty('--preview-left', `${viewport?.pageLeft ?? window.scrollX}px`);
  };
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  update();
})();

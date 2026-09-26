/** Keep the game page fitted to the visible pane when browser zoom narrows it. */
export function installViewportLayout(root: HTMLElement): () => void {
  const view = root.ownerDocument.defaultView;
  if (!view) return () => {};
  const viewport = view.visualViewport;
  const update = () => {
    root.style.setProperty('--preview-width', `${viewport?.width ?? view.innerWidth}px`);
    // Normal vertical page scrolling still works; only horizontal framing follows the pane.
    root.style.setProperty('--preview-left', `${viewport?.pageLeft ?? view.scrollX}px`);
  };
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  view.addEventListener('resize', update);
  update();
  return () => {
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    view.removeEventListener('resize', update);
    root.style.removeProperty('--preview-width');
    root.style.removeProperty('--preview-left');
  };
}

/** Pan down only as far as the opaque lower bar can hide the background edge. */
export function liftCinematicWorld(y: number, roomHeight: number, zoom: number, viewportHeight: number, coveredBottom: number, lift: number): number {
  const visibleBottom = viewportHeight - Math.max(0, Math.min(viewportHeight, coveredBottom));
  const available = Math.max(0, y + roomHeight * zoom - visibleBottom);
  return y - Math.min(Math.max(0, lift), available);
}

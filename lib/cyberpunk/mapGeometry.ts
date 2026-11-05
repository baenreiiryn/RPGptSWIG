export type Point = { x: number; y: number };
export type MapView = Point & { scale: number };
export const mapPoint = (point: Point, view: MapView): Point => ({
  x: (point.x - view.x) / view.scale,
  y: (point.y - view.y) / view.scale,
});
export function zoomAt(view: MapView, point: Point, scale: number): MapView {
  const world = mapPoint(point, view);
  return { scale, x: point.x - world.x * scale, y: point.y - world.y * scale };
}
export function clampView(view: MapView, size: Point, world: Point): MapView {
  const bound = (p: number, viewport: number, extent: number) =>
    extent <= viewport
      ? (viewport - extent) / 2
      : Math.min(0, Math.max(viewport - extent, p));
  return {
    ...view,
    x: bound(view.x, size.x, world.x * view.scale),
    y: bound(view.y, size.y, world.y * view.scale),
  };
}

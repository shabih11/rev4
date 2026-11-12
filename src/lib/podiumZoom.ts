export const podiumWidth = 1220;
export const podiumHeight = 580;

interface ZoomAnchor {
  width: number;
  sceneWidth?: number;
  fit: number;
  zoom: number;
  nextZoom: number;
  scrollLeft: number;
  scrollTop: number;
  x: number;
  y: number;
  nextX?: number;
  nextY?: number;
}

// Keep the same point of the scene under the mouse or midpoint of the fingers.
// The scene is centered until wider than the viewport, with a 12px side gutter.
export function zoomPodiumAtPoint(anchor: ZoomAnchor) {
  const zoom = Number.isFinite(anchor.nextZoom) ? Math.max(1, Math.min(6, anchor.nextZoom)) : anchor.zoom;
  const sceneWidth = anchor.sceneWidth ?? podiumWidth;
  const before = anchor.fit * anchor.zoom;
  const after = anchor.fit * zoom;
  const oldWidth = Math.max(anchor.width, sceneWidth * before + 24);
  const newWidth = Math.max(anchor.width, sceneWidth * after + 24);
  const sceneX = (anchor.scrollLeft + anchor.x - (oldWidth - sceneWidth * before) / 2) / before;
  const sceneY = (anchor.scrollTop + anchor.y - 16) / before;
  return {
    zoom,
    scrollLeft: Math.max(0, sceneX * after + (newWidth - sceneWidth * after) / 2 - (anchor.nextX ?? anchor.x)),
    scrollTop: Math.max(0, sceneY * after + 16 - (anchor.nextY ?? anchor.y)),
  };
}

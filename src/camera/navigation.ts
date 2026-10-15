import type { Vec2 } from '../physics/vector';
import { clamp, length, sub } from '../physics/vector';
import type { Rect } from '../world/geometry';
import type { Camera } from './camera';
import { worldToScreen } from './camera';
export interface EdgeMarker { position: Vec2; angle: number; distance: number }
export function edgeMarker(camera: Camera, target: Vec2, origin = camera.position, margin = 30): EdgeMarker | undefined {
  const screen = worldToScreen(camera, target);
  if (screen.x >= 0 && screen.x <= camera.width && screen.y >= 0 && screen.y <= camera.height) return undefined;
  const dx = screen.x - camera.width / 2; const dy = screen.y - camera.height / 2;
  const inset = Math.min(margin, camera.width / 4, camera.height / 4);
  const t = Math.min((camera.width / 2 - inset) / Math.max(Math.abs(dx), 1e-9), (camera.height / 2 - inset) / Math.max(Math.abs(dy), 1e-9));
  return { position: { x: camera.width / 2 + dx * t, y: camera.height / 2 + dy * t }, angle: Math.atan2(dy, dx), distance: length(sub(target, origin)) };
}
export function mapPoint(point: Vec2, world: Rect, panel: Rect): Vec2 {
  return { x: panel.minX + clamp((point.x - world.minX) / Math.max(1, world.maxX - world.minX), 0, 1) * (panel.maxX - panel.minX),
    y: panel.minY + clamp((point.y - world.minY) / Math.max(1, world.maxY - world.minY), 0, 1) * (panel.maxY - panel.minY) };
}
export function navigationBounds(base: Rect, positions: Vec2[]): Rect {
  const result = { ...base };
  for (const p of positions) { result.minX = Math.min(result.minX, p.x - 100); result.maxX = Math.max(result.maxX, p.x + 100); result.minY = Math.min(result.minY, p.y - 100); result.maxY = Math.max(result.maxY, p.y + 100); }
  return result;
}

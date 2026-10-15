import type { Vec2 } from '../physics/vector';
import { add, clamp, limit, scale, sub } from '../physics/vector';
import type { Rect } from '../world/geometry';
import { circleBounds, intersects } from '../world/geometry';
export interface Camera { position: Vec2; zoom: number; width: number; height: number }
export function createCamera(position: Vec2, width = 1100, height = 620): Camera { return { position: { ...position }, width, height, zoom: 0.8 }; }
export function follow(camera: Camera, position: Vec2, velocity: Vec2, dt: number, snap = false): void {
  const target = add(position, limit(scale(velocity, 0.65), 140));
  const alpha = snap ? 1 : 1 - Math.exp(-5 * Math.max(0, Math.min(dt, 0.25)));
  camera.position = add(camera.position, scale(sub(target, camera.position), alpha));
}
export function resizeCamera(camera: Camera, width: number, height: number): void { camera.width = Math.max(1, width); camera.height = Math.max(1, height); }
export function setZoom(camera: Camera, zoom: number): void { camera.zoom = clamp(zoom, 0.3, 2); }
export function worldToScreen(camera: Camera, world: Vec2): Vec2 {
  return { x: (world.x - camera.position.x) * camera.zoom + camera.width / 2, y: (world.y - camera.position.y) * camera.zoom + camera.height / 2 };
}
export function screenToWorld(camera: Camera, screen: Vec2): Vec2 {
  return { x: (screen.x - camera.width / 2) / camera.zoom + camera.position.x, y: (screen.y - camera.height / 2) / camera.zoom + camera.position.y };
}
export function viewBounds(camera: Camera): Rect {
  const a = screenToWorld(camera, { x: 0, y: 0 }); const b = screenToWorld(camera, { x: camera.width, y: camera.height });
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
}
export const isVisible = (camera: Camera, p: Vec2, radius = 0): boolean => intersects(viewBounds(camera), circleBounds(p, radius));

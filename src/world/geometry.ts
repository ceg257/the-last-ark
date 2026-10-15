import type { Vec2 } from '../physics/vector';
export interface Rect { minX: number; minY: number; maxX: number; maxY: number }
export const circleBounds = (p: Vec2, r: number): Rect => ({ minX: p.x - r, minY: p.y - r, maxX: p.x + r, maxY: p.y + r });
export const intersects = (a: Rect, b: Rect): boolean => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
export const contains = (r: Rect, p: Vec2): boolean => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
export function sweptBounds(a: Vec2, b: Vec2, radius: number): Rect {
  return { minX: Math.min(a.x, b.x) - radius, minY: Math.min(a.y, b.y) - radius, maxX: Math.max(a.x, b.x) + radius, maxY: Math.max(a.y, b.y) + radius };
}
export function segmentIntersectsRect(a: Vec2, b: Vec2, box: Rect): boolean {
  if (box.minX > box.maxX || box.minY > box.maxY) return false;
  let enter = 0; let exit = 1;
  for (const [start, delta, min, max] of [[a.x, b.x - a.x, box.minX, box.maxX], [a.y, b.y - a.y, box.minY, box.maxY]]) {
    if (Math.abs(delta) < 1e-12) { if (start < min || start > max) return false; continue; }
    const t0 = (min - start) / delta; const t1 = (max - start) / delta;
    enter = Math.max(enter, Math.min(t0, t1)); exit = Math.min(exit, Math.max(t0, t1));
    if (enter > exit) return false;
  }
  return true;
}

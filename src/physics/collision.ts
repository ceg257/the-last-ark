import { sub } from './vector';
import type { Vec2 } from './vector';
/** Swept circle collision in relative coordinates, including initial overlap. */
export function sweptOverlap(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2, radius: number): boolean {
  const start = sub(a0, b0);
  const end = sub(a1, b1);
  const d = sub(end, start);
  const n = d.x * d.x + d.y * d.y;
  const t = n === 0 ? 0 : Math.max(0, Math.min(1, -(start.x * d.x + start.y * d.y) / n));
  return Math.hypot(start.x + t * d.x, start.y + t * d.y) <= radius;
}

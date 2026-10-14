export interface Vec2 { x: number; y: number }
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
export const length = (v: Vec2): number => Math.hypot(v.x, v.y);
export const finite = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);
export function limit(v: Vec2, max: number): Vec2 {
  const n = length(v);
  return n > max ? scale(v, max / n) : { ...v };
}
export const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

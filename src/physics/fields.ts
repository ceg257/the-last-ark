import type { Field } from '../game/types';
import { length, scale, sub } from './vector';
import type { Vec2 } from './vector';
/** Softened inverse-square acceleration with a smooth cutoff at the range edge. */
export function fieldAcceleration(target: Vec2, source: Vec2, field: Field): Vec2 {
  const delta = sub(source, target);
  const distance = length(delta);
  if (distance < 1e-8 || distance >= field.radius) return { x: 0, y: 0 };
  const taper = (1 - (distance / field.radius) ** 2) ** 2;
  const magnitude = Math.min(field.maxAcceleration, field.strength / (distance ** 2 + field.softening ** 2) * taper);
  return scale(delta, field.polarity * magnitude / distance);
}

/** In-place form: identical arithmetic to `fieldAcceleration`, no per-call object.
 * The allocating version resolves `sub` and `scale` into fresh Vec2s (vector.ts:3-4); that
 * is one object per source per call, which is what the field-visual arrow would otherwise
 * pay ~10 times a frame. Same shape as the other ...Into forms in this package. */
export function fieldAccelerationInto(out: Vec2, target: Vec2, source: Vec2, field: Field): Vec2 {
  const dx = source.x - target.x, dy = source.y - target.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-8 || distance >= field.radius) { out.x = 0; out.y = 0; return out; }
  const taper = (1 - (distance / field.radius) ** 2) ** 2;
  const magnitude = Math.min(field.maxAcceleration, field.strength / (distance ** 2 + field.softening ** 2) * taper);
  const factor = field.polarity * magnitude / distance;
  out.x = dx * factor; out.y = dy * factor;
  return out;
}

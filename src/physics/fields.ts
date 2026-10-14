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

import type { Body, Field } from '../game/types';
import { capabilities } from '../game/entities';

// Match the original radius-65 planet, while deriving every body's field from size.
const REFERENCE_RADIUS = 65;
const REFERENCE_VOLUME = 4 / 3 * Math.PI * REFERENCE_RADIUS ** 3;
export function gravitationalMass(body: Body): number {
  const density = capabilities(body).density;
  return 4 / 3 * Math.PI * body.radius ** 3 * density;
}

/** All physical bodies are gravity sources, including small asteroids and the ship.
 * Source motion comes from the same integrator as the ship, enabling gravity assists.
 * Range/softening/caps remain deliberate gameplay approximations, not real astronomy.
 */
export const emptyField = (): Field =>
  ({ radius: 0, strength: 0, softening: 0, maxAcceleration: 0, polarity: 1 });
/** In-place form: identical arithmetic to `bodyGravity`, no per-call object. */
export function bodyGravityInto(field: Field, body: Body): Field {
  field.strength = 110_000 * gravitationalMass(body) / REFERENCE_VOLUME;
  field.radius = body.gravityRadius ?? Math.max(120, body.radius * 330 / REFERENCE_RADIUS);
  field.softening = Math.max(24, body.radius * 85 / REFERENCE_RADIUS);
  field.maxAcceleration = 170;
  field.polarity = 1;
  return field;
}
export function bodyGravity(body: Body): Field {
  return bodyGravityInto(emptyField(), body);
}

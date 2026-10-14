import type { Body, Field } from '../game/types';

// Match the original radius-65 planet, while deriving every body's field from size.
const REFERENCE_RADIUS = 65;
const REFERENCE_VOLUME = 4 / 3 * Math.PI * REFERENCE_RADIUS ** 3;
export function gravitationalMass(body: Body): number {
  const density = body.density ?? (body.kind === 'blackHole' ? 40 : 1);
  return 4 / 3 * Math.PI * body.radius ** 3 * density;
}

/** All physical bodies are gravity sources, including small asteroids and the ship.
 * Source motion comes from the same integrator as the ship, enabling gravity assists.
 * Range/softening/caps remain deliberate gameplay approximations, not real astronomy.
 */
export function bodyGravity(body: Body): Field {
  return {
    strength: 110_000 * gravitationalMass(body) / REFERENCE_VOLUME,
    radius: Math.max(120, body.radius * 330 / REFERENCE_RADIUS),
    softening: Math.max(24, body.radius * 85 / REFERENCE_RADIUS),
    maxAcceleration: 170,
    polarity: 1,
  };
}

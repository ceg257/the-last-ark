import type { Body, Player } from '../game/types';
import { add, limit, scale } from './vector';
import { fieldAcceleration } from './fields';
import { bodyGravity } from './gravity';
export const MAX_ACCELERATION = 170;
export const MAX_SPEED = 240;
export const speedLimit = (body: Body): number => Math.min(MAX_SPEED, Math.max(0, body.maxSpeed ?? MAX_SPEED));
/** Snapshot all accelerations first: results do not depend on body iteration order. */
function accelerations(bodies: Body[], players: Player[]) {
  const gravity = bodies.map(bodyGravity);
  return bodies.map(body => {
    let acceleration = { x: 0, y: 0 };
    if (!body.affectedByFields) return acceleration;
    for (const player of players) {
      if (player.active) acceleration = add(acceleration, fieldAcceleration(body.position, player.position, player.field));
    }
    for (const [i, source] of bodies.entries()) {
      if (source !== body) acceleration = add(acceleration, fieldAcceleration(body.position, source.position, gravity[i]));
    }
    return limit(scale(acceleration, body.response), MAX_ACCELERATION);
  });
}

/** Velocity Verlet (kick-drift-kick): sample gravity before AND after every body's
 * movement. No artificial drag or one-off slingshot boost. The speed cap is a
 * separate gameplay rule that intentionally discards energy when reached.
 */
export function integrate(bodies: Body[], players: Player[], dt: number): void {
  const before = accelerations(bodies, players);
  bodies.forEach((body, i) => {
    body.velocity = limit(add(body.velocity, scale(before[i], dt / 2)), speedLimit(body));
    body.position = add(body.position, scale(body.velocity, dt));
  });
  const after = accelerations(bodies, players);
  bodies.forEach((body, i) => {
    body.velocity = limit(add(body.velocity, scale(after[i], dt / 2)), speedLimit(body));
  });
}

import type { Body, Player } from '../game/types';
import { add, limit, scale } from './vector';
import { fieldAcceleration } from './fields';
import { bodyGravity } from './gravity';
import { capabilities } from '../game/entities';
import { SpatialIndex } from '../world/spatial-index';
import { circleBounds } from '../world/geometry';
export const MAX_ACCELERATION = 170;
export const MAX_SPEED = 240;
export const speedLimit = (body: Body): number => Math.min(MAX_SPEED, Math.max(0, body.maxSpeed ?? MAX_SPEED));
/** Snapshot all accelerations first: results do not depend on body iteration order. */
function accelerations(bodies: Body[], players: Player[], stats: { candidatePairs: number }) {
  const gravity = bodies.map(bodyGravity);
  const sources = new SpatialIndex<number>();
  bodies.forEach((body, i) => {
    if (capabilities(body).gravity && gravity[i].strength > 0) sources.insert(i, circleBounds(body.position, gravity[i].radius));
  });
  return bodies.map(body => {
    let acceleration = { x: 0, y: 0 };
    if (!body.affectedByFields || capabilities(body).motion !== 'dynamic') return acceleration;
    for (const player of players) {
      if (player.active) acceleration = add(acceleration, fieldAcceleration(body.position, player.position, player.field));
    }
    for (const i of sources.query(circleBounds(body.position, 0))) {
      const source = bodies[i];
      if (source !== body) { stats.candidatePairs++; acceleration = add(acceleration, fieldAcceleration(body.position, source.position, gravity[i])); }
    }
    return limit(scale(acceleration, body.response), MAX_ACCELERATION);
  });
}

/** Velocity Verlet (kick-drift-kick): sample gravity before AND after every body's
 * movement. No artificial drag or one-off slingshot boost. The speed cap is a
 * separate gameplay rule that intentionally discards energy when reached.
 */
export function integrate(bodies: Body[], players: Player[], dt: number): { candidatePairs: number } {
  const stats = { candidatePairs: 0 };
  const before = accelerations(bodies, players, stats);
  bodies.forEach((body, i) => {
    if (capabilities(body).motion === 'static') return;
    body.velocity = limit(add(body.velocity, scale(before[i], dt / 2)), speedLimit(body));
    body.position = add(body.position, scale(body.velocity, dt));
  });
  const after = accelerations(bodies, players, stats);
  bodies.forEach((body, i) => {
    if (capabilities(body).motion !== 'dynamic') return;
    body.velocity = limit(add(body.velocity, scale(after[i], dt / 2)), speedLimit(body));
  });
  return stats;
}

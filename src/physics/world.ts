import type { Body, Player } from '../game/types';
import { add, limit, scale } from './vector';
import { fieldAcceleration } from './fields';
export const MAX_ACCELERATION = 170;
export const MAX_SPEED = 240;
/** Snapshot all accelerations first: results do not depend on body iteration order. */
export function integrate(bodies: Body[], players: Player[], dt: number): void {
  const accelerations = bodies.map(body => {
    let acceleration = { x: 0, y: 0 };
    if (!body.affectedByFields) return acceleration;
    for (const player of players) {
      if (player.active) acceleration = add(acceleration, fieldAcceleration(body.position, player.position, player.field));
    }
    for (const source of bodies) {
      if (source !== body && source.gravity) acceleration = add(acceleration, fieldAcceleration(body.position, source.position, source.gravity));
    }
    return limit(scale(acceleration, body.response), MAX_ACCELERATION);
  });
  bodies.forEach((body, i) => {
    body.velocity = limit(add(body.velocity, scale(accelerations[i], dt)), MAX_SPEED);
    body.position = add(body.position, scale(body.velocity, dt));
  });
}

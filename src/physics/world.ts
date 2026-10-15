import type { Body, Player } from '../game/types';
import type { Vec2 } from './vector';
import { add, length, limit, scale } from './vector';
import { fieldAcceleration } from './fields';
import { bodyGravity } from './gravity';
import { capabilities } from '../game/entities';
import { SpatialIndex } from '../world/spatial-index';
import { circleBounds } from '../world/geometry';
import { stabilize } from './stabilization';
export const MAX_ACCELERATION = 170;
export const MAX_SPEED = 240;
export const speedLimit = (body: Body): number => Math.min(MAX_SPEED, Math.max(0, body.maxSpeed ?? MAX_SPEED));
interface Acceleration { total: Vec2; player: Vec2; effectiveField: boolean }
/** Snapshot all sources first. Separate the player contribution without changing gravity. */
function accelerations(bodies: Body[], players: Player[], stats: { candidatePairs: number }): Acceleration[] {
  const gravity = bodies.map(bodyGravity);
  const sources = new SpatialIndex<number>();
  bodies.forEach((body, i) => {
    if (capabilities(body).gravity && gravity[i].strength > 0) sources.insert(i, circleBounds(body.position, gravity[i].radius));
  });
  return bodies.map(body => {
    let player = { x: 0, y: 0 }, environment = { x: 0, y: 0 };
    let effectiveField = false;
    if (!body.affectedByFields || capabilities(body).motion !== 'dynamic') return {total:environment,player,effectiveField};
    for (const source of players) if (source.active) {
      const acceleration = fieldAcceleration(body.position, source.position, source.field);
      // Even two cancelling fields count as active; a field outside range does not.
      if (length(acceleration) * body.response > (body.stabilization?.fieldEpsilon ?? 1e-4)) effectiveField = true;
      player = add(player, acceleration);
    }
    for (const i of sources.query(circleBounds(body.position, 0))) {
      const source = bodies[i];
      if (source !== body) { stats.candidatePairs++; environment = add(environment, fieldAcceleration(body.position, source.position, gravity[i])); }
    }
    const sum = scale(add(player, environment), body.response);
    const factor = Math.min(1, MAX_ACCELERATION / Math.max(length(sum), 1e-12));
    return { total: scale(sum, factor), player: scale(player, body.response * factor), effectiveField };
  });
}
function kick(body: Body, acceleration: Acceleration, dt: number): void {
  const velocity = add(body.velocity, scale(acceleration.total, dt));
  const factor = Math.min(1, speedLimit(body) / Math.max(length(velocity), 1e-12));
  body.velocity = limit(velocity, speedLimit(body));
  if (body.stabilizationState) body.stabilizationState.playerVelocity = scale(add(body.stabilizationState.playerVelocity, scale(acceleration.player, dt)), factor);
}
/** Original kick-drift-kick integrator, plus an opt-in dissipative step for
 * player-injected disturbances. Ship capability forbids damping even if misconfigured.
 * Environmental gravity and initial orbital motion are never damped.
 */
export function integrate(bodies: Body[], players: Player[], dt: number, stabilizationEnabled = true): { candidatePairs: number } {
  const stats = { candidatePairs: 0 };
  if (!Number.isFinite(dt) || dt <= 0) return stats;
  for (const body of bodies) {
    if (body.stabilization && capabilities(body).stabilizable && capabilities(body).motion === 'dynamic') {
      body.stabilizationState ??= {playerVelocity:{x:0,y:0},idleTime:0};
    } else delete body.stabilizationState;
  }
  const before = accelerations(bodies, players, stats);
  bodies.forEach((body, i) => {
    if (capabilities(body).motion === 'static') return;
    kick(body,before[i],dt/2);
    body.position = add(body.position, scale(body.velocity, dt));
  });
  const after = accelerations(bodies, players, stats);
  bodies.forEach((body, i) => {
    if (capabilities(body).motion !== 'dynamic') return;
    kick(body,after[i],dt/2);
    stabilize(body,before[i].effectiveField || after[i].effectiveField,dt,stabilizationEnabled);
    // Removing a cancelling disturbance can expose a larger base speed: preserve the global cap.
    const factor = Math.min(1,speedLimit(body)/Math.max(length(body.velocity),1e-12));
    body.velocity = limit(body.velocity,speedLimit(body));
    if (body.stabilizationState) body.stabilizationState.playerVelocity = scale(body.stabilizationState.playerVelocity,factor);
  });
  return stats;
}

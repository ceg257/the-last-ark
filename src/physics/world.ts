import type { Body, Field, Player } from '../game/types';
import type { Capabilities } from '../game/entities';
import type { Vec2 } from './vector';
import { fieldAcceleration } from './fields';
import { bodyGravityInto, emptyField } from './gravity';
import { capabilities, capabilitiesInto } from '../game/entities';
import { SpatialIndex } from '../world/spatial-index';
import { circleBounds } from '../world/geometry';
import { stabilize } from './stabilization';
export const MAX_ACCELERATION = 170;
export const MAX_SPEED = 240;
export const speedLimit = (body: Body): number => Math.min(MAX_SPEED, Math.max(0, body.maxSpeed ?? MAX_SPEED));
interface Acceleration { total: Vec2; player: Vec2; effectiveField: boolean }

/** Scratch state reused across integrate() calls, so a 720-step forecast stops
 * allocating ~18n objects per step. integrate() is synchronous and never re-entrant
 * (live stepping and prediction are sequential calls, never nested), so module-level
 * buffers are safe here. Every slot is written in full on each use -- no value may
 * survive from one step into the next.
 *
 * Both acceleration buffers stay live for the whole call: integrate() reads
 * before[i].effectiveField after the `after` pass has already been built.
 * Capability and gravity slots are pure functions of fields that do not change
 * between the two passes (the pass in between moves position and velocity only).
 */
const capabilitiesScratch: Capabilities[] = [];
const gravityScratch: Field[] = [];
const accelerationBuffers: Acceleration[][] = [[], []];
const queryBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const queryResult: number[] = [];
let bufferStep = 0;

function capabilitiesOf(bodies: Body[]): Capabilities[] {
  for (let i = 0; i < bodies.length; i++) {
    const slot = capabilitiesScratch[i];
    if (slot) capabilitiesInto(slot, bodies[i]);
    else capabilitiesScratch[i] = capabilities(bodies[i]);
  }
  capabilitiesScratch.length = bodies.length;
  return capabilitiesScratch;
}

function gravityOf(bodies: Body[]): Field[] {
  for (let i = 0; i < bodies.length; i++) {
    const slot = gravityScratch[i];
    if (slot) bodyGravityInto(slot, bodies[i]);
    else gravityScratch[i] = bodyGravityInto(emptyField(), bodies[i]);
  }
  gravityScratch.length = bodies.length;
  return gravityScratch;
}

function accelerationBuffer(step: number, count: number): Acceleration[] {
  const buffer = accelerationBuffers[step];
  for (let i = 0; i < count; i++) {
    if (!buffer[i]) buffer[i] = { total: { x: 0, y: 0 }, player: { x: 0, y: 0 }, effectiveField: false };
  }
  buffer.length = count;
  return buffer;
}

/** Above this many bodies the spatial index pays for itself; at or below it, building
 * one costs far more than scanning. Both paths produce the identical candidate set in
 * the identical order, so this is a pure speed knob and never a correctness one.
 *
 * Measured 2026-10-15 with bench/threshold.perf.ts (single-step integrate, µs/step):
 *
 *   n    :   4     8    16    32    64    96   128   192   256
 *   scan :  9.9  27.2  31.0  64.7   178   377   477  1340  2096
 *   index: 16.2  32.0  44.6  87.8   154   209   283   412   558
 *
 * Crossover is around 48-64; 48 keeps the scan wherever it still wins and hands over
 * before the quadratic term takes over. The forecast workload showed why this matters:
 * at n=4 the index was 30.8% of the run (queryInto 19.6% + insert 11.2%) spent to hold
 * THREE gravity sources, and 40.8% at n=32. */
const INDEX_THRESHOLD = 48;

/** Snapshot all sources first. Separate the player contribution without changing gravity. */
function accelerations(bodies: Body[], players: Player[], gravity: Field[], caps: Capabilities[],
  out: Acceleration[], stats: { candidatePairs: number }): void {
  const count = bodies.length;
  let sources: SpatialIndex<number> | null = null;
  if (count > INDEX_THRESHOLD) {
    sources = new SpatialIndex<number>();
    for (let i = 0; i < count; i++) {
      if (caps[i].gravity && gravity[i].strength > 0) sources.insert(i, circleBounds(bodies[i].position, gravity[i].radius));
    }
  }
  for (let i = 0; i < count; i++) {
    const body = bodies[i], slot = out[i];
    slot.effectiveField = false;
    // The original returned early here, leaving totals at zero. A reused slot has to be
    // zeroed explicitly or it would carry the previous step's acceleration.
    if (!body.affectedByFields || caps[i].motion !== 'dynamic') {
      slot.total.x = 0; slot.total.y = 0; slot.player.x = 0; slot.player.y = 0;
      continue;
    }
    let px = 0, py = 0, ex = 0, ey = 0;
    for (const source of players) if (source.active) {
      const acceleration = fieldAcceleration(body.position, source.position, source.field);
      // Even two cancelling fields count as active; a field outside range does not.
      if (Math.hypot(acceleration.x, acceleration.y) * body.response > (body.stabilization?.fieldEpsilon ?? 1e-4)) slot.effectiveField = true;
      px += acceleration.x; py += acceleration.y;
    }
    if (sources) {
      // A zero-radius circle bound is a point rectangle. Writing the components straight
      // into the reused Rect skips one allocation per body; the only difference from
      // circleBounds(position, 0) is the sign of zero, which reaches neither the
      // comparisons in intersects() nor the integer cell keys below.
      queryBounds.minX = body.position.x; queryBounds.minY = body.position.y;
      queryBounds.maxX = body.position.x; queryBounds.maxY = body.position.y;
      for (const j of sources.queryInto(queryBounds, queryResult)) {
        const source = bodies[j];
        if (source === body) continue;
        stats.candidatePairs++;
        const acceleration = fieldAcceleration(body.position, source.position, gravity[j]);
        ex += acceleration.x; ey += acceleration.y;
      }
    } else if (Number.isFinite(body.position.x) && Number.isFinite(body.position.y)) {
      // Direct scan. Same candidates in the same order as the index would return:
      // sources are inserted in ascending index, queryInto() re-sorts by insertion order,
      // and this loop walks ascending too -- so the gravity sum is accumulated in the
      // identical sequence. The AABB test below is circleBounds(pos, r) vs the target's
      // point, copied from intersects(), so `candidatePairs` counts exactly what the
      // index path counts. Nothing here may be relaxed to a distance test: a source that
      // fails the box but is still within r would be a different pair count, and one that
      // passes the box but is out of range contributes exactly +0.0 either way.
      const qx = body.position.x, qy = body.position.y;
      for (let j = 0; j < count; j++) {
        if (j === i || !caps[j].gravity || gravity[j].strength <= 0) continue;
        const source = bodies[j], sx = source.position.x, sy = source.position.y;
        // The index drops non-finite bounds at insert (spatial-index.ts finiteRect).
        // Without this the comparisons below all read false and a NaN source would be
        // summed into ex/ey, where the index path contributed nothing at all.
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
        const radius = gravity[j].radius;
        if (qx > sx + radius || qx < sx - radius || qy > sy + radius || qy < sy - radius) continue;
        stats.candidatePairs++;
        const acceleration = fieldAcceleration(body.position, source.position, gravity[j]);
        ex += acceleration.x; ey += acceleration.y;
      }
    }
    const response = body.response;
    const sumX = (px + ex) * response, sumY = (py + ey) * response;
    const factor = Math.min(1, MAX_ACCELERATION / Math.max(Math.hypot(sumX, sumY), 1e-12));
    slot.total.x = sumX * factor; slot.total.y = sumY * factor;
    slot.player.x = px * (response * factor); slot.player.y = py * (response * factor);
  }
}

/** add / scale / limit / length inlined against the body's own vectors. Same arithmetic
 * and the same operation order as the allocating originals, including the fact that
 * `factor` is derived from the pre-cap velocity. */
function kick(body: Body, acceleration: Acceleration, dt: number): void {
  const velocity = body.velocity;
  velocity.x += acceleration.total.x * dt;
  velocity.y += acceleration.total.y * dt;
  const cap = speedLimit(body);
  const speed = Math.hypot(velocity.x, velocity.y);
  const factor = Math.min(1, cap / Math.max(speed, 1e-12));
  if (speed > cap) { const shrink = cap / speed; velocity.x *= shrink; velocity.y *= shrink; }
  if (body.stabilizationState) {
    const playerVelocity = body.stabilizationState.playerVelocity;
    playerVelocity.x = (playerVelocity.x + acceleration.player.x * dt) * factor;
    playerVelocity.y = (playerVelocity.y + acceleration.player.y * dt) * factor;
  }
}

/** Per-body fields that integrate() derives from a body rather than from its motion. */
export interface BodyFields { caps: Capabilities[]; gravity: Field[] }

/** Original kick-drift-kick integrator, plus an opt-in dissipative step for
 * player-injected disturbances. Ship capability forbids damping even if misconfigured.
 * Environmental gravity and initial orbital motion are never damped.
 *
 * `precomputed` lets a 720-step forecast hand the same {caps, gravity} to every step.
 * Neither is a function of position or velocity, and nothing in this function writes
 * them, so rebuilding them per step was 720 x 3N evaluations of a pure function --
 * gravitationalMass resolves capabilities a second time on top of that (gravity.ts:8).
 * Live stepping passes nothing and keeps the original behaviour, which matters because
 * a caller there may mutate `kind`/`layer` in place between calls. The length check
 * makes a mismatched pair fall back instead of reading past the end of a stale array.
 */
export function integrate(bodies: Body[], players: Player[], dt: number, stabilizationEnabled = true,
  precomputed?: BodyFields): { candidatePairs: number } {
  const stats = { candidatePairs: 0 };
  if (!Number.isFinite(dt) || dt <= 0) return stats;
  const count = bodies.length;
  const fields = precomputed && precomputed.caps.length === count && precomputed.gravity.length === count ? precomputed : undefined;
  const caps = fields ? fields.caps : capabilitiesOf(bodies);
  for (let i = 0; i < count; i++) {
    const body = bodies[i];
    if (body.stabilization && caps[i].stabilizable && caps[i].motion === 'dynamic') {
      body.stabilizationState ??= {playerVelocity:{x:0,y:0},idleTime:0};
    } else delete body.stabilizationState;
  }
  const gravity = fields ? fields.gravity : gravityOf(bodies);
  const before = accelerationBuffer(bufferStep, count);
  accelerations(bodies, players, gravity, caps, before, stats);
  for (let i = 0; i < count; i++) {
    const body = bodies[i];
    if (caps[i].motion === 'static') continue;
    kick(body,before[i],dt/2);
    body.position.x += body.velocity.x * dt;
    body.position.y += body.velocity.y * dt;
  }
  bufferStep ^= 1;
  const after = accelerationBuffer(bufferStep, count);
  accelerations(bodies, players, gravity, caps, after, stats);
  for (let i = 0; i < count; i++) {
    const body = bodies[i];
    if (caps[i].motion !== 'dynamic') continue;
    kick(body,after[i],dt/2);
    stabilize(body,before[i].effectiveField || after[i].effectiveField,dt,stabilizationEnabled);
    // Removing a cancelling disturbance can expose a larger base speed: preserve the global cap.
    const velocity = body.velocity;
    const cap = speedLimit(body);
    const speed = Math.hypot(velocity.x, velocity.y);
    const factor = Math.min(1,cap/Math.max(speed,1e-12));
    if (speed > cap) { const shrink = cap / speed; velocity.x *= shrink; velocity.y *= shrink; }
    if (body.stabilizationState) {
      const playerVelocity = body.stabilizationState.playerVelocity;
      playerVelocity.x *= factor;
      playerVelocity.y *= factor;
    }
  }
  return stats;
}

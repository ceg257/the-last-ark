import type { Body } from '../game/types';
import { add, length, scale, sub } from './vector';
/** Only directly player-injected velocity is dissipated. The remainder includes
 * initial orbital velocity and every environmental gravity impulse, and is retained.
 * This is an intentional gameplay approximation, not a reconstruction of an unperturbed orbit.
 */
export function stabilize(body: Body, effectiveField: boolean, dt: number, enabled: boolean): void {
  const config = body.stabilization, state = body.stabilizationState;
  if (!config || !state) return;
  if (effectiveField) { state.idleTime = 0; return; }
  const oldTime = state.idleTime;
  state.idleTime += dt;
  if (!enabled || !Number.isFinite(config.halfLife) || config.halfLife <= 0) return;
  const ramp = Math.max(0, config.rampSeconds ?? 0.25);
  // Integral of (1-exp(-t/ramp)): continuous onset, independent of render FPS.
  const exposure = ramp === 0 ? dt : dt - ramp * (Math.exp(-oldTime / ramp) - Math.exp(-state.idleTime / ramp));
  const baseline = sub(body.velocity, state.playerVelocity);
  let disturbance = scale(state.playerVelocity, Math.exp(-Math.LN2 * Math.max(0, exposure) / config.halfLife));
  if (length(disturbance) < (config.sleepSpeed ?? 0.03)) disturbance = {x:0,y:0};
  state.playerVelocity = disturbance;
  body.velocity = add(baseline, disturbance);
}

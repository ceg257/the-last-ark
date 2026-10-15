import type { Controls, GameState } from './types';
import type { Vec2 } from '../physics/vector';
import { finite } from '../physics/vector';
import { FIXED_DT, stepGame } from './game';

export const PREDICTION_SECONDS = 12;
export interface Trajectory {
  points: Vec2[];
  seconds: number;
  outcome: 'horizon' | 'completed' | 'failed' | 'transition';
}

/** Forecast using the exact live rules on an isolated state copy.
 * Players keep CURRENT toggle states and release movement: existing velocity
 * follows the same assisted braking as live play (no instant forecast freeze).
 * Every celestial body keeps moving and attracting every other eligible body.
 */
export function predictTrajectory(game: GameState, seconds = PREDICTION_SECONDS): Trajectory {
  const result: Trajectory = { points: [], seconds: 0, outcome: 'horizon' };
  if (game.phase === 'completed' || game.phase === 'failed') return result;
  const { checkpoint: _checkpoint, ...state } = game;
  const simulation: GameState = structuredClone(state);
  simulation.phase = 'running';
  const input: Controls = {
    movement: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    fields: [simulation.players[0].active, simulation.players[1].active],
  };
  const ship = simulation.bodies.find(body => body.kind === 'ship')!;
  if (!finite(ship.position) || !finite(ship.velocity)) return result;
  result.points.push({ ...ship.position });
  const steps = Math.ceil(Math.min(PREDICTION_SECONDS, Math.max(0, seconds)) / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    stepGame(simulation, input);
    // stepGame mutates phase; TypeScript otherwise retains the earlier literal narrowing.
    const phase = simulation.phase as GameState['phase'];
    result.seconds = (i + 1) * FIXED_DT;
    if (finite(ship.position) && ((i + 1) % 6 === 0 || phase !== 'running' || simulation.pendingScene || i === steps - 1)) {
      result.points.push({ ...ship.position });
    }
    if (simulation.pendingScene) { result.outcome = 'transition'; break; }
    if (phase === 'completed' || phase === 'failed') {
      result.outcome = phase;
      break;
    }
  }
  return result;
}

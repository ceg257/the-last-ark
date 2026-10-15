import type { Player } from '../game/types';
import { copyIntent } from '../input/intent';
import type { PlayerControlIntent } from '../input/intent';
import type { Vec2 } from './vector';
import { add, length, limit, scale, sub } from './vector';

function advance(player: Player, targetVelocity: Vec2, acceleration: number, dt: number): void {
  player.velocity = add(player.velocity, limit(sub(targetVelocity, player.velocity), Math.max(0, acceleration) * dt));
  player.position = add(player.position, scale(player.velocity, dt));
}

/** Existing keyboard/axis dynamics, independent of celestial gravity and rendering. */
export function movePlayer(player: Player, direction: Vec2, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const input = limit(direction, 1);
  advance(player, scale(input, player.speed), length(input) > 0 ? player.acceleration : player.braking, dt);
}

/** The only input-to-player mutation boundary. No device is allowed to move a node directly. */
export function applyPlayerIntent(player: Player, raw: PlayerControlIntent, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const intent = copyIntent(raw);
  player.active = intent.abilityActive;
  if (intent.moveX !== 0 || intent.moveY !== 0 || !intent.targetWorldPosition) {
    movePlayer(player, { x: intent.moveX, y: intent.moveY }, dt);
    return;
  }
  const offset = sub(intent.targetWorldPosition, player.position);
  const distance = length(offset);
  // Stopping-distance envelope plus a smooth arrival envelope near the point.
  // No position snapping, no instantaneous speed reset, including after a target jump.
  const speed = Math.min(player.speed, Math.sqrt(2 * Math.max(0, Math.min(player.acceleration, player.braking)) * distance),
    distance / Math.max(dt, player.targetArrivalSeconds ?? 0.25));
  const target = distance > 0 ? scale(offset, speed / distance) : { x: 0, y: 0 };
  advance(player, target, speed < length(player.velocity) ? player.braking : player.acceleration, dt);
}

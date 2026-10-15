import type { Player } from '../game/types';
import type { Vec2 } from '../physics/vector';
import { add, length, limit, scale, sub } from '../physics/vector';
/** Control projections have their own dynamics; celestial gravity never enters here. */
export function movePlayer(player: Player, direction: Vec2, dt: number): void {
  const input = limit(direction, 1);
  const target = scale(input, player.speed);
  const acceleration = length(input) > 0 ? player.acceleration : player.braking;
  player.velocity = add(player.velocity, limit(sub(target, player.velocity), Math.max(0, acceleration) * dt));
  player.position = add(player.position, scale(player.velocity, dt));
}

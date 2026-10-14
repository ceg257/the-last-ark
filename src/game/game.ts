import type { Controls, GameState, Level } from './types';
import { add, clamp, finite, length, limit, scale, sub } from '../physics/vector';
import { integrate } from '../physics/world';
import { sweptOverlap } from '../physics/collision';
export const FIXED_DT = 1 / 60;
export function createGame(level: Level): GameState {
  return { level: structuredClone(level), bodies: structuredClone(level.bodies), players: structuredClone(level.players), phase: 'ready', elapsed: 0, message: '准备就绪 · Space 发射；可先调整玩家位置' };
}
export function togglePause(game: GameState): void {
  if (game.phase === 'ready' || game.phase === 'paused') { game.phase = 'running'; game.message = '护航中 · 绕开中央天体，低速入港'; }
  else if (game.phase === 'running') { game.phase = 'paused'; game.message = '已暂停 · 可移动玩家；Space 继续'; }
}
export function pause(game: GameState): void { if (game.phase === 'running') togglePause(game); }
function lose(game: GameState, message: string): void { game.phase = 'lost'; game.message = `${message} · R 重试`; }
export function stepGame(game: GameState, input: Controls, dt = FIXED_DT): void {
  if (game.phase === 'won' || game.phase === 'lost') return;
  game.players.forEach((player, i) => {
    const movement = scale(limit(input.movement[i], 1), player.speed * dt);
    const next = add(player.position, movement);
    player.position = { x: clamp(next.x, player.radius, game.level.width - player.radius), y: clamp(next.y, player.radius, game.level.height - player.radius) };
    player.active = input.fields[i];
  });
  if (game.phase !== 'running') return;
  const previous = game.bodies.map(body => ({ ...body.position }));
  integrate(game.bodies, game.players, dt);
  game.elapsed += dt;
  if (game.bodies.some(body => !finite(body.position) || !finite(body.velocity))) { lose(game, '模拟数值异常'); return; }
  const shipIndex = game.bodies.findIndex(body => body.kind === 'ship');
  const ship = game.bodies[shipIndex];
  for (let i = 0; i < game.bodies.length; i++) {
    const body = game.bodies[i];
    if (i === shipIndex) continue;
    const danger = body.kind === 'blackHole' ? body.captureRadius ?? body.radius : body.radius;
    if (sweptOverlap(previous[shipIndex], ship.position, previous[i], body.position, ship.radius + danger)) {
      lose(game, body.kind === 'blackHole' ? '飞船被黑洞吞噬' : '飞船撞击危险天体'); return;
    }
  }
  const { x, y } = ship.position;
  if (x - ship.radius < 0 || x + ship.radius > game.level.width || y - ship.radius < 0 || y + ship.radius > game.level.height) { lose(game, '飞船离开护航边界'); return; }
  const port = game.level.port;
  const inside = length(sub(ship.position, port.position)) + ship.radius <= port.radius;
  if (inside && length(ship.velocity) <= port.maxEntrySpeed) { game.phase = 'won'; game.message = '安全抵达！幸存者已进入空间港 · R 再次护航'; }
  else if (inside) game.message = '入港速度过高！继续制动至 ≤ ' + port.maxEntrySpeed;
  else game.message = '护航中 · 绕开中央天体，低速入港';
  // Non-ship bodies leave the level or are consumed without failing the mission.
  game.bodies = game.bodies.filter((body, i) => {
    if (body.kind !== 'asteroid') return true;
    if (body.position.x < -body.radius || body.position.x > game.level.width + body.radius || body.position.y < -body.radius || body.position.y > game.level.height + body.radius) return false;
    return !game.bodies.some((other, j) => other.kind === 'blackHole' && sweptOverlap(previous[i], body.position, previous[j], other.position, body.radius + (other.captureRadius ?? other.radius)));
  });
}

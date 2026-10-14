import type { GameState } from '../game/types';
import { length } from '../physics/vector';
const STATUS = { ready: '待发射', running: '护航中', paused: '已暂停', won: '安全抵达', lost: '任务失败' };
export function telemetry(game: GameState): string {
  const ship = game.bodies.find(body => body.kind === 'ship')!;
  return `${game.level.name}　|　${STATUS[game.phase]}　|　速度 ${length(ship.velocity).toFixed(1)} / 上限 ${game.level.port.maxEntrySpeed}　|　方舟 (${ship.position.x.toFixed(0)}, ${ship.position.y.toFixed(0)})　|　${game.elapsed.toFixed(1)} s`;
}
export function render(ctx: CanvasRenderingContext2D, game: GameState): void {
  const { width, height, port } = game.level;
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#0c1220'; ctx.fillRect(0, 0, width, height);
  const circle = (x: number, y: number, radius: number, color: string, fill = true) => {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.strokeStyle = color; fill ? ctx.fill() : ctx.stroke();
  };
  ctx.lineWidth = 1; ctx.strokeStyle = '#344155'; ctx.strokeRect(1, 1, width - 2, height - 2);
  for (const player of game.players) {
    if (!player.active) continue;
    const blue = player.id === 'attractor';
    circle(player.position.x, player.position.y, player.field.radius, blue ? '#409eff12' : '#e9bd4812');
    circle(player.position.x, player.position.y, player.field.radius, blue ? '#409eff70' : '#e9bd4870', false);
  }
  ctx.lineWidth = 3; circle(port.position.x, port.position.y, port.radius, '#64d98b', false);
  ctx.fillStyle = '#9de3b3'; ctx.font = '15px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`空间港 · ≤ ${port.maxEntrySpeed}`, port.position.x, port.position.y + port.radius + 26);
  for (const body of game.bodies) {
    if (body.kind === 'ship') {
      // A straight tangent, not a forecast of the curved gravitational trajectory.
      if (body.velocity.x > 5 && body.position.x < port.position.x) {
        const time = Math.min(20, (port.position.x - body.position.x) / body.velocity.x);
        ctx.save(); ctx.beginPath(); ctx.moveTo(body.position.x, body.position.y);
        ctx.lineTo(body.position.x + body.velocity.x * time, body.position.y + body.velocity.y * time);
        ctx.strokeStyle = '#ffffff38'; ctx.lineWidth = 1; ctx.setLineDash([5, 7]); ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(Math.atan2(body.velocity.y, body.velocity.x));
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
    } else {
      circle(body.position.x, body.position.y, body.radius, body.kind === 'asteroid' ? '#8993a3' : '#8f69b9');
      if (body.kind === 'blackHole') circle(body.position.x, body.position.y, body.captureRadius ?? body.radius, '#110a22');
    }
  }
  for (const [i, player] of game.players.entries()) {
    circle(player.position.x, player.position.y, player.radius, i === 0 ? '#409eff' : '#e9bd48');
    ctx.fillStyle = '#e5eaf4'; ctx.font = '14px system-ui';
    ctx.fillText(i === 0 ? 'P1 吸引 [F]' : 'P2 排斥 [Enter]', Math.max(65, Math.min(width - 65, player.position.x)), Math.max(52, player.position.y - 23));
    if (game.phase === 'paused' || game.phase === 'ready') {
      ctx.font = '12px system-ui'; ctx.fillStyle = '#92a0b3';
      ctx.fillText(`(${player.position.x.toFixed(0)}, ${player.position.y.toFixed(0)})`, Math.max(45, Math.min(width - 45, player.position.x)), Math.min(height - 12, player.position.y + 30));
    }
  }
  ctx.textAlign = 'left'; ctx.font = '16px system-ui'; ctx.fillStyle = game.phase === 'lost' ? '#ff9a9a' : game.phase === 'won' ? '#8aefaa' : '#c4cede'; ctx.fillText(game.message, 22, 30);
  if (game.phase === 'ready') { ctx.fillStyle = '#8b99ae'; ctx.font = '14px system-ui'; ctx.fillText('白色三角 = 方舟　灰色 = 可移动陨石　紫色 = 危险引力天体', 22, height - 22); }
}

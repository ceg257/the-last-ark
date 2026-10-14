import type { GameState } from '../game/types';
import { length } from '../physics/vector';
import { speedLimit } from '../physics/world';
import type { Trajectory } from '../game/trajectory';
const STATUS = { ready: '待发射', running: '护航中', paused: '已暂停', won: '安全抵达', lost: '任务失败' };
export function telemetry(game: GameState): string {
  const ship = game.bodies.find(body => body.kind === 'ship')!;
  return `${game.level.name}　|　${STATUS[game.phase]}　|　速度 ${length(ship.velocity).toFixed(1)} / 限速 ${speedLimit(ship)}（入港 ≤ ${game.level.port.maxEntrySpeed}）　|　方舟 (${ship.position.x.toFixed(0)}, ${ship.position.y.toFixed(0)})　|　${game.elapsed.toFixed(1)} s`;
}
export function render(ctx: CanvasRenderingContext2D, game: GameState, trajectory: Trajectory): void {
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
  if (trajectory.points.length > 1) {
    const color = trajectory.outcome === 'lost' ? '#ed9b9b' : trajectory.outcome === 'won' ? '#64d98b' : '#b5c8e0';
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.moveTo(trajectory.points[0].x, trajectory.points[0].y);
    for (const point of trajectory.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke(); ctx.restore();
    const end = trajectory.points.at(-1)!;
    circle(end.x, end.y, 4, color, false);
    ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.font = '13px system-ui';
    const outcome = trajectory.outcome === 'lost' ? '危险终点' : trajectory.outcome === 'won' ? '安全入港' : '预览终点';
    ctx.fillText(`预测 ${trajectory.seconds.toFixed(1)} 秒 · ${outcome}`, width - 22, 53);
    ctx.textAlign = 'center';
  }
  for (const body of game.bodies) {
    if (body.kind === 'ship') {
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
    ctx.fillText(`${i === 0 ? 'P1 吸引 [F]' : 'P2 排斥 [Enter]'} · ${player.active ? '开' : '关'}`, Math.max(85, Math.min(width - 85, player.position.x)), Math.max(70, player.position.y - 23));
    if (game.phase === 'paused' || game.phase === 'ready') {
      ctx.font = '12px system-ui'; ctx.fillStyle = '#92a0b3';
      ctx.fillText(`(${player.position.x.toFixed(0)}, ${player.position.y.toFixed(0)})`, Math.max(45, Math.min(width - 45, player.position.x)), Math.min(height - 12, player.position.y + 30));
    }
  }
  ctx.textAlign = 'left'; ctx.font = '16px system-ui'; ctx.fillStyle = game.phase === 'lost' ? '#ff9a9a' : game.phase === 'won' ? '#8aefaa' : '#c4cede'; ctx.fillText(game.message, 22, 30);
  if (game.phase === 'ready') { ctx.fillStyle = '#8b99ae'; ctx.font = '14px system-ui'; ctx.fillText('白色三角 = 方舟　灰色 = 可移动陨石　紫色 = 危险引力天体', 22, height - 22); }
}

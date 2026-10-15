import type { GameState } from '../game/types';
import { length, sub } from '../physics/vector';
import { speedLimit } from '../physics/world';
import type { Trajectory } from '../game/trajectory';
import type { Camera } from '../camera/camera';
import { isVisible, viewBounds } from '../camera/camera';
import { edgeMarker, mapPoint, navigationBounds } from '../camera/navigation';
import { objectivePosition } from '../game/mission';
import { visibleEntities } from './visibility';
import { efficiency } from '../game/scoring';
import type { VisualState } from './scene-visuals';
import { drawStarfield } from './starfield';
import { drawTrail } from './trail';
import { drawBody } from './celestial';
import { collectFields, drawFields, drawNetForceArrow } from './field-visuals';
import type { FieldSource } from './field-visuals';
import { BG } from './palette';
/** One buffer for the process lifetime: collectFields rewrites it in place every frame. */
const fieldBuffer: FieldSource[] = [];
const STATUS = { ready: '待发射', running: '护航中', paused: '已暂停', completed: '安全抵达', failed: '任务失败' };
export function telemetry(game: GameState): string {
  const ship = game.bodies.find(body => body.kind === 'ship')!;
  const result = efficiency(game);
  return game.level.name + ' | ' + STATUS[game.phase] + ' | 速度 ' + length(ship.velocity).toFixed(1) + ' / 限速 ' + speedLimit(ship)
    + ' | 方舟 (' + ship.position.x.toFixed(0) + ', ' + ship.position.y.toFixed(0) + ') | ' + game.elapsed.toFixed(1) + ' s'
    + (result ? ' | 航程 ' + result.distance.toFixed(1) + (result.stars ? ' | ' + '★'.repeat(result.stars) + '☆'.repeat(3-result.stars) : '') : '');
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, fill = true): void {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.strokeStyle = color; fill ? ctx.fill() : ctx.stroke();
}
export function renderTitle(ctx: CanvasRenderingContext2D, camera: Camera, visuals: VisualState): void {
  ctx.fillStyle = BG; ctx.fillRect(0, 0, camera.width, camera.height);
  // The title screen is the one place the starfield drifts on its own -- with no ship to
  // fly, a still image would read as a screenshot. In game the drift term is zero and the
  // stars move only because the camera does.
  drawStarfield(ctx, camera, visuals.starfield, visuals.time * 8);
  ctx.textAlign = 'center'; ctx.fillStyle = '#e5eaf4'; ctx.font = '26px system-ui'; ctx.fillText('THE LAST ARK', camera.width / 2, camera.height / 2 - 48);
  ctx.font = '16px system-ui'; ctx.fillText('Space / 点击上方按钮 · 进入原试玩关', camera.width / 2, camera.height / 2);
  ctx.font = '13px system-ui'; ctx.fillStyle = '#92a0b3';
  ctx.fillText('教学 / Solar Exodus / Beyond the Horizon / Endless', camera.width / 2, camera.height / 2 + 48);
  ctx.fillText('后续场景规划中，本次仅开放原试玩关', camera.width / 2, camera.height / 2 + 76);
}
export function render(ctx: CanvasRenderingContext2D, game: GameState, trajectory: Trajectory, camera: Camera, visuals: VisualState): void {
  const { width, height } = camera;
  const ship = game.bodies.find(b => b.kind === 'ship')!;
  const target = objectivePosition(game);
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = BG; ctx.fillRect(0, 0, width, height);
  // Screen space, outside the world transform: these are depth layers, not world geometry.
  drawStarfield(ctx, camera, visuals.starfield, 0);
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.position.x, -camera.position.y);
  ctx.lineWidth = 1 / camera.zoom;
  // Fields first: everything else in the world is read against them.
  drawFields(ctx, collectFields(game, fieldBuffer), camera, visuals.spec, game.phase);
  if (trajectory.points.length > 1) {
    const color = trajectory.outcome === 'failed' ? '#ed9b9b' : trajectory.outcome === 'completed' ? '#64d98b' : '#b5c8e0';
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.5 / camera.zoom; ctx.setLineDash([5 / camera.zoom, 6 / camera.zoom]);
    ctx.beginPath(); ctx.moveTo(trajectory.points[0].x, trajectory.points[0].y);
    for (const point of trajectory.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke(); ctx.restore();
    const end = trajectory.points.at(-1)!;
    if (isVisible(camera, end, 4)) circle(ctx, end.x, end.y, 4, color, false);
  }
  // Trails go down before the glyphs they belong to, so the ship and the player nodes always
  // stay on top of their own wakes.
  for (const player of game.players) {
    const slot = visuals.trails.get(player.id);
    if (slot) drawTrail(ctx, slot.trail, camera, slot.style);
  }
  const shipTrail = visuals.trails.get(ship.id);
  if (shipTrail) drawTrail(ctx, shipTrail.trail, camera, shipTrail.style);
  for (const body of visibleEntities(camera, game.bodies)) drawBody(ctx, body, camera);
  for (const player of visibleEntities(camera, game.players)) {
    const i = player.id === 'attractor' ? 0 : 1;
    circle(ctx, player.position.x, player.position.y, player.radius, i === 0 ? '#409eff' : '#e9bd48');
    ctx.fillStyle = '#e5eaf4'; ctx.font = '14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText((i === 0 ? 'P1 [F]' : 'P2 [Enter]') + (player.active ? ' 开' : ' 关'), player.position.x, player.position.y - 23);
    if (game.phase === 'paused' || game.phase === 'ready') {
      ctx.font = '12px system-ui'; ctx.fillText('(' + player.position.x.toFixed(0) + ', ' + player.position.y.toFixed(0) + ')', player.position.x, player.position.y + 30);
    }
  }
  ctx.restore();
  // Screen space, so the arrow's length means the same thing at every zoom.
  drawNetForceArrow(ctx, game, camera, visuals.spec);
  // Navigation and HUD are screen-space, never fed back into simulation.
  const marker = (position: {x:number;y:number}, label: string, color: string, margin = 30, labelOffset = 20) => {
    const edge = edgeMarker(camera, position, ship.position, margin); if (!edge) return;
    ctx.save(); ctx.translate(edge.position.x, edge.position.y); ctx.rotate(edge.angle);
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-7, -5); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore();
    ctx.font = '12px system-ui'; ctx.fillStyle = color;
    ctx.textAlign = edge.position.x > width / 2 ? 'right' : 'left';
    ctx.fillText(label + ' ' + edge.distance.toFixed(0), edge.position.x, Math.min(height - 8, Math.max(76, edge.position.y + labelOffset)));
  };
  game.players.forEach((p, i) => marker(p.position, i === 0 ? 'P1' : 'P2', i === 0 ? '#409eff' : '#e9bd48'));
  if (target) marker(target, '目标', '#64d98b', 65, -18);
  const panel = { minX: width - Math.min(210, width * 0.35) - 14, maxX: width - 14, minY: height - 134, maxY: height - 14 };
  const entities = [...game.bodies, ...game.players].filter(e => e.layer !== 'hidden' && e.layer !== 'background');
  const bounds = navigationBounds(game.level.mapBounds ?? {minX:0,minY:0,maxX:game.level.width,maxY:game.level.height}, [...entities.map(e => e.position), ...(target ? [target] : [])]);
  ctx.fillStyle = '#060b14e6'; ctx.fillRect(panel.minX, panel.minY, panel.maxX-panel.minX, panel.maxY-panel.minY);
  ctx.strokeStyle = '#48566b'; ctx.strokeRect(panel.minX, panel.minY, panel.maxX-panel.minX, panel.maxY-panel.minY);
  const view = viewBounds(camera); const a = mapPoint({x:view.minX,y:view.minY}, bounds, panel); const b = mapPoint({x:view.maxX,y:view.maxY},bounds,panel);
  ctx.strokeStyle = '#8e9bab'; ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
  for (const entity of entities) {
    const p = mapPoint(entity.position,bounds,panel);
    circle(ctx,p.x,p.y,entity.kind === 'ship' ? 3 : 2, entity.kind === 'ship' ? '#fff' : entity.kind === 'player' ? entity.id === 'attractor' ? '#409eff' : '#e9bd48' : '#8f69b9');
  }
  if (target) { const p = mapPoint(target,bounds,panel); circle(ctx,p.x,p.y,4,'#64d98b',false); }
  ctx.textAlign = 'left'; ctx.font = '12px system-ui'; ctx.fillStyle = '#aab8ca'; ctx.fillText('导航 · 当前已载入区域', panel.minX, panel.minY-7);
  ctx.fillStyle = game.phase === 'failed' ? '#ff9a9a' : '#c4cede'; ctx.font = '14px system-ui'; ctx.fillText(game.message, 16, 25, width-32);
  ctx.fillStyle = '#92a0b3'; ctx.font = '12px system-ui';
  const outcome = { horizon: '预览终点', failed: '危险终点', completed: '安全入港', transition: '场景出口' }[trajectory.outcome];
  ctx.fillText('预测 ' + trajectory.seconds.toFixed(1) + ' s · ' + outcome + ' · 缩放 ' + camera.zoom.toFixed(2) + (target ? ' · 目标距离 ' + length(sub(target,ship.position)).toFixed(0) : ''),16,46);
  ctx.fillText('P1 ' + (game.players[0].active ? '开' : '关') + ' / P2 ' + (game.players[1].active ? '开' : '关') + ' · 检查点 ' + (game.checkpoint?.id ?? '无'),16,height-16);
}

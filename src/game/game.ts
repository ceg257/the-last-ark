import type { Body, Controls, GameState, Level, Player } from './types';
import type { Vec2 } from '../physics/vector';
import type { BodyFields } from '../physics/world';
import { finite, length, sub } from '../physics/vector';
import { applyPlayerIntent } from '../physics/player';
import { integrate } from '../physics/world';
import { bodyGravity } from '../physics/gravity';
import { sweptOverlap } from '../physics/collision';
import { capabilities } from './entities';
import { emptyMissionState, evaluateMission, currentObjective, arrivalStatus } from './mission';
import { SpatialIndex } from '../world/spatial-index';
import { contains, sweptBounds } from '../world/geometry';
export const FIXED_DT = 1 / 60;
export function saveCheckpoint(game: GameState, id: string): void {
  const { checkpoint: _previous, ...state } = game;
  game.checkpoint = { id, snapshot: structuredClone(state) };
}
export function createGame(level: Level): GameState {
  const config = structuredClone(level);
  if (!config.mission && config.port) config.mission = {
    objectives: [{ id: 'dock', label: '低速进入空间港（≤ ' + config.port.maxEntrySpeed + '）',
      target: { position: config.port.position }, condition: { type: 'speed_in_region', entityId: config.bodies.find(b => b.kind === 'ship')!.id,
        region: { shape: 'circle', center: config.port.position, radius: config.port.radius }, maxSpeed: config.port.maxEntrySpeed, fullContainment: true } }], triggers: [],
  };
  const game: GameState = { level: config, bodies: structuredClone(config.bodies), players: structuredClone(config.players), phase: 'ready', elapsed: 0,
    message: '准备就绪 · Space 发射；可先调整玩家位置', mission: emptyMissionState(), distance: 0 };
  saveCheckpoint(game, 'start');
  return game;
}
export function retryGame(game: GameState): GameState {
  const restored: GameState = game.checkpoint ? structuredClone(game.checkpoint.snapshot) : createGame(game.level);
  restored.phase = 'ready'; restored.players.forEach(p => { p.active = false; }); delete restored.pendingScene;
  restored.message = '已恢复检查点 · Space 继续；Shift+R 从头开始';
  saveCheckpoint(restored, game.checkpoint?.id ?? 'start');
  return restored;
}
export function togglePause(game: GameState): void {
  if (game.phase === 'ready' || game.phase === 'paused') { game.phase = 'running'; game.message = currentObjective(game)?.label ?? '护航中'; }
  else if (game.phase === 'running') { game.phase = 'paused'; game.message = '已暂停 · 可移动玩家；Space 继续'; }
}
export function pause(game: GameState): void { if (game.phase === 'running') togglePause(game); }
function lose(game: GameState, message: string): void { game.phase = 'failed'; game.message = message + ' · R 重试'; }

/** Per-entity snapshot of where everything was at the start of the step, for swept
 * collision and for mission conditions that care about crossing a boundary.
 *
 * Building it fresh -- two array spreads, a concat, a tuple array, N position copies and
 * a Map -- was the most expensive single line in the step, and a 720-step forecast paid
 * it 720 times. Slots and the map are reused instead. Stale ids are deleted, so the
 * contents are exactly what
 * `new Map([...bodies, ...players].map(b => [b.id, { ...b.position }]))` would hold:
 * `hits()` reads `previous.get(id)!` with no fallback below, and mission.ts:55 reads it
 * with one, so a stale id would silently revive a body that is no longer simulated.
 *
 * stepGame is synchronous and never re-entrant -- live stepping and forecast steps are
 * sequential calls, never nested -- so one shared map is safe, the same argument as
 * src/physics/world.ts:26. A live step and a forecast write the same ids in turn; each
 * step rewrites every id it later reads before reading it. */
const previousBuffer = new Map<string, Vec2>();
/** The arrays the buffer was last built for, so an unchanged step can skip the rebuild. */
let lastBodies: Body[] | null = null;
let lastPlayers: Player[] | null = null;
let lastCount = -1;
/** Survivors of the capture pass, reused so the common "nothing was captured" step does
 * not allocate an array. Never handed out -- the filtered array is a copy. */
const survivors: Body[] = [];

function rememberPosition(entity: Body | Player): void {
  const slot = previousBuffer.get(entity.id);
  if (slot) { slot.x = entity.position.x; slot.y = entity.position.y; }
  else previousBuffer.set(entity.id, { x: entity.position.x, y: entity.position.y });
}

function snapshotPrevious(bodies: Body[], players: Player[]): Map<string, Vec2> {
  // Every step below rewrites every id it later reads, so the only way the buffer can hold
  // an id that is no longer simulated is if the arrays themselves were swapped out -- a new
  // level, a forecast's structuredClone, or the capture filter replacing game.bodies. Those
  // are all whole-array replacements, so identity (plus the length, for an in-place push)
  // detects them, and a rebuild-from-scratch is exact. Tracking that per step with a Set of
  // written ids cost more than the map it was guarding.
  if (bodies !== lastBodies || players !== lastPlayers || bodies.length + players.length !== lastCount) {
    previousBuffer.clear();
    lastBodies = bodies; lastPlayers = players; lastCount = bodies.length + players.length;
  }
  for (let i = 0; i < bodies.length; i++) rememberPosition(bodies[i]);
  for (let i = 0; i < players.length; i++) rememberPosition(players[i]);
  return previousBuffer;
}

/** Hoisted out of stepGame: the closure was rebuilt on every step and `.some` allocated
 * a second one per call. Same predicate, same short-circuit order as the original
 * `bodies.some(...) || players.some(...)`. */
function anyInvalid(game: GameState): boolean {
  for (let i = 0; i < game.bodies.length; i++) {
    const body = game.bodies[i];
    if (!finite(body.position) || !finite(body.velocity)) return true;
  }
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    if (!finite(player.position) || !finite(player.velocity)) return true;
  }
  return false;
}

/** Per-body fields for a forecast, rebuilt only when the bodies array itself changes.
 *
 * Keyed on array identity, which is sound here and only here. predictTrajectory steps a
 * fresh structuredClone, so every forecast starts from a new array and can never hit a
 * stale entry; inside one forecast nothing writes radius/density/kind/layer/motion/
 * emitsGravity/collision/response/gravityRadius -- only positions and velocities move --
 * and the capture filter below is the one thing that replaces the array. The live path
 * deliberately does not use this: there a caller may mutate `kind` in place between two
 * steps (tests/game.test.ts does), which identity would not notice. */
let cachedBodies: Body[] | null = null;
let cachedFields: BodyFields | null = null;
function forecastFields(bodies: Body[]): BodyFields {
  if (bodies !== cachedBodies) {
    cachedBodies = bodies;
    cachedFields = { caps: bodies.map(body => capabilities(body)), gravity: bodies.map(body => bodyGravity(body)) };
  }
  return cachedFields!;
}

/** `forecast` marks the copy predictTrajectory steps: identical physics, collision and
 * mission evaluation, minus the bookkeeping only the live game reads. See below. */
export function stepGame(game: GameState, input: Controls, dt = FIXED_DT, forecast = false): void {
  if (game.phase === 'completed' || game.phase === 'failed') return;
  if (!Number.isFinite(dt) || dt <= 0) return;
  const previous = snapshotPrevious(game.bodies, game.players);
  for (let i = 0; i < game.players.length; i++) {
    applyPlayerIntent(game.players[i], input.players[i], dt);
  }
  if (game.phase !== 'running') return;
  if (anyInvalid(game)) { lose(game, '模拟数值异常'); return; }
  integrate(game.bodies, game.players, dt, game.level.stabilizationEnabled !== false,
    forecast ? forecastFields(game.bodies) : undefined);
  game.elapsed += dt;
  // Both scans stay, forecast included: the second one is the only thing that catches a
  // NaN produced by integrate, and it decides phase -- i.e. the forecast's `outcome` and
  // `seconds`. Dropping it would report a failure one step late.
  if (anyInvalid(game)) { lose(game, '模拟数值异常'); return; }
  const ship = game.bodies.find(b => b.kind === 'ship');
  if (!ship) { lose(game, '关卡缺少方舟'); return; }
  game.distance += length(sub(ship.position, previous.get(ship.id)!));
  const hazards = new SpatialIndex<typeof ship>();
  const dangerRadius = (b: typeof ship) => capabilities(b).collision === 'capture' ? b.captureRadius ?? b.radius : b.radius;
  for (const body of game.bodies) if (body !== ship && capabilities(body).collision !== 'none') {
    hazards.insert(body, sweptBounds(previous.get(body.id)!, body.position, dangerRadius(body)));
  }
  const hits = (body: typeof ship, captureOnly = false) => hazards.query(sweptBounds(previous.get(body.id)!, body.position, body.radius)).find(other =>
    other !== body && (!captureOnly || capabilities(other).collision === 'capture') &&
    sweptOverlap(previous.get(body.id)!, body.position, previous.get(other.id)!, other.position, body.radius + dangerRadius(other)));
  const collision = hits(ship);
  if (collision) { lose(game, capabilities(collision).collision === 'capture' ? '飞船被吞噬' : '飞船撞击危险天体'); return; }
  const bounds = game.level.missionBounds;
  if (bounds && (!contains(bounds, {x:ship.position.x-ship.radius,y:ship.position.y-ship.radius}) || !contains(bounds, {x:ship.position.x+ship.radius,y:ship.position.y+ship.radius}))) {
    lose(game, '飞船离开任务边界'); return;
  }
  // Offscreen bodies remain simulated. Only configured capture hazards remove dynamic
  // bodies. Same survivors in the same order as the filter this replaces, but the array is
  // only replaced when something is actually removed: rebuilding it every step allocated a
  // fresh copy just to hand it straight back, and it also defeated forecastFields() above,
  // which keys on that array's identity.
  survivors.length = 0;
  let captured = false;
  for (let i = 0; i < game.bodies.length; i++) {
    const body = game.bodies[i];
    if (body === ship || capabilities(body).motion !== 'dynamic' || !hits(body, true)) survivors.push(body);
    else captured = true;
  }
  if (captured) game.bodies = survivors.slice();
  const checkpoint = evaluateMission(game, previous);
  // Everything past here is live-only. predictTrajectory reads none of it: `message` is
  // never inspected, and trajectory.ts:21 drops `checkpoint` before cloning, so
  // saveCheckpoint's full structuredClone of the state is 720 dead clones per forecast.
  // evaluateMission itself stays -- it is what sets phase, pendingScene and the fired
  // objectives/triggers the rest of the forecast depends on.
  if (forecast) return;
  // The arrival explanation outranks the hint: a mission hint is set once by a trigger and
  // then never cleared, so deferring to it would hide the one message that says why the ark
  // is sitting on the station and nothing is happening.
  const arrival = game.phase === 'running' ? arrivalStatus(game) : undefined;
  game.message = (game.phase as GameState['phase']) === 'completed' ? '安全抵达！· R 恢复检查点；Shift+R 重新护航'
    : arrival ? (arrival.contained
      ? '已进入空间港，但速度 ' + arrival.speed.toFixed(1) + ' > ' + arrival.maxSpeed + ' · 减速后再靠近'
      : '尚未完全进入空间港 · 整个机身都要进去（当前速度 ' + arrival.speed.toFixed(1) + '）')
    : game.mission.hint ?? currentObjective(game)?.label ?? '护航中';
  if (checkpoint) saveCheckpoint(game, checkpoint);
}

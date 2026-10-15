import type { Entity, GameState } from './types';
import type { Vec2 } from '../physics/vector';
import { length, sub } from '../physics/vector';
import { sweptOverlap } from '../physics/collision';
import type { Rect } from '../world/geometry';
import { contains, segmentIntersectsRect } from '../world/geometry';
import type { SceneId } from '../scenes/types';

export type Region = { shape: 'circle'; center: Vec2; radius: number }
  | { shape: 'rect'; bounds: Rect }
  | { shape: 'band'; center: Vec2; innerRadius: number; outerRadius: number };
export type Condition =
  | { type: 'enter_region' | 'inside_region' | 'entity_at' | 'cross_band'; entityId: string; region: Region; fullContainment?: boolean; maxSpeed?: number }
  | { type: 'speed_in_region'; entityId: string; region: Region; maxSpeed: number; fullContainment?: boolean }
  | { type: 'near_entity'; entityId: string; targetId: string; maxSpeed?: number; fullContainment?: boolean }
  | { type: 'objective_complete'; objectiveId: string }
  | { type: 'all'; conditions: Condition[] };
export interface Objective { id: string; label: string; condition: Condition; requires?: string[]; optional?: boolean; target?: { position: Vec2 } | { entityId: string } }
export type TriggerAction = { type: 'hint'; text: string } | { type: 'checkpoint'; id: string }
  | { type: 'transition'; scene: SceneId } | { type: 'complete' };
export interface Trigger { id: string; condition: Condition; requires?: string[]; actions: TriggerAction[] }
export interface Mission { objectives: Objective[]; triggers: Trigger[]; completeOnObjectives?: boolean }
export interface MissionState { completedObjectives: string[]; firedTriggers: string[]; hint?: string }
export const emptyMissionState = (): MissionState => ({ completedObjectives: [], firedTriggers: [] });
export const findEntity = (game: GameState, id: string): Entity | undefined => game.bodies.find(b => b.id === id) ?? game.players.find(p => p.id === id);

function inside(region: Region, position: Vec2, radius: number): boolean {
  if (region.shape === 'circle') return length(sub(position, region.center)) + radius <= region.radius;
  if (region.shape === 'band') { const d = length(sub(position, region.center)); return d - radius >= region.innerRadius && d + radius <= region.outerRadius; }
  const b = region.bounds;
  return contains({ minX: b.minX + radius, maxX: b.maxX - radius, minY: b.minY + radius, maxY: b.maxY - radius }, position);
}
function crosses(region: Region, previous: Vec2, position: Vec2, radius: number): boolean {
  if (region.shape === 'circle') return region.radius >= radius && sweptOverlap(previous, position, region.center, region.center, region.radius - radius);
  if (region.shape === 'rect') {
    const b = region.bounds;
    return segmentIntersectsRect(previous, position, { minX: b.minX + radius, maxX: b.maxX - radius, minY: b.minY + radius, maxY: b.maxY - radius });
  }
  const outer = region.outerRadius - radius; const inner = region.innerRadius + radius;
  return outer >= inner && sweptOverlap(previous, position, region.center, region.center, outer)
    && Math.max(length(sub(previous, region.center)), length(sub(position, region.center))) >= inner;
}
export function conditionMet(game: GameState, condition: Condition, previous: Map<string, Vec2>): boolean {
  if (condition.type === 'all') return condition.conditions.every(item => conditionMet(game, item, previous));
  if (condition.type === 'objective_complete') return game.mission.completedObjectives.includes(condition.objectiveId);
  const entity = findEntity(game, condition.entityId);
  if (!entity) return false;
  const body = game.bodies.find(item => item.id === entity.id);
  if (condition.maxSpeed !== undefined && (!body || length(body.velocity) > condition.maxSpeed)) return false;
  const radius = condition.fullContainment ? entity.radius : 0;
  if (condition.type === 'near_entity') {
    const target = findEntity(game, condition.targetId);
    if (!target) return false;
    if (condition.maxSpeed !== undefined) return length(sub(entity.position, target.position)) + radius <= target.radius;
    return target.radius >= radius && sweptOverlap(previous.get(entity.id) ?? entity.position, entity.position,
      previous.get(target.id) ?? target.position, target.position, target.radius - radius);
  }
  const old = previous.get(entity.id) ?? entity.position;
  if (condition.type === 'enter_region') return !inside(condition.region, old, radius) && crosses(condition.region, old, entity.position, radius);
  if (condition.type === 'cross_band') return crosses(condition.region, old, entity.position, radius);
  return inside(condition.region, entity.position, radius);
}
export function evaluateMission(game: GameState, previous: Map<string, Vec2>): string | undefined {
  const config = game.level.mission;
  if (!config) return;
  const requirementsMet = (requires: string[] = []) => requires.every(id => game.mission.completedObjectives.includes(id));
  for (let pass = 0; pass < config.objectives.length; pass++) {
    let changed = false;
    for (const objective of config.objectives) {
      if (game.mission.completedObjectives.includes(objective.id) || !requirementsMet(objective.requires)) continue;
      if (conditionMet(game, objective.condition, previous)) { game.mission.completedObjectives.push(objective.id); changed = true; }
    }
    if (!changed) break;
  }
  let checkpoint: string | undefined;
  for (const trigger of config.triggers) {
    if (game.mission.firedTriggers.includes(trigger.id) || !requirementsMet(trigger.requires) || !conditionMet(game, trigger.condition, previous)) continue;
    game.mission.firedTriggers.push(trigger.id);
    for (const action of trigger.actions) {
      if (action.type === 'hint') game.mission.hint = action.text;
      if (action.type === 'checkpoint') checkpoint = action.id;
      if (action.type === 'transition') game.pendingScene = action.scene;
      if (action.type === 'complete') game.phase = 'completed';
    }
  }
  const required = config.objectives.filter(objective => !objective.optional);
  if (config.completeOnObjectives !== false && required.length > 0 && required.every(objective => game.mission.completedObjectives.includes(objective.id))) game.phase = 'completed';
  return checkpoint;
}
export function currentObjective(game: GameState): Objective | undefined {
  return game.level.mission?.objectives.find(objective => !game.mission.completedObjectives.includes(objective.id)
    && (objective.requires ?? []).every(id => game.mission.completedObjectives.includes(id)));
}
export function objectivePosition(game: GameState): Vec2 | undefined {
  const target = currentObjective(game)?.target;
  if (!target) return game.level.port?.position;
  return 'position' in target ? target.position : findEntity(game, target.entityId)?.position;
}
/** Why an arrival objective has not completed even though the ark is already at the
 * destination.
 *
 * Arrival is a conjunction -- fully inside the region AND slow enough -- and until this
 * existed, failing either half was completely silent. The ark would sit on the station with
 * its predicted trajectory ending right there and no completion, which reads as a broken win
 * condition rather than as "you are still doing 65 into the dock". The mission label states
 * the rule, but nothing stated that the rule was the thing currently blocking.
 *
 * Only the two speed-limited arrival conditions can be blocked this way; a positional
 * objective is either satisfied or the ark is not there yet, which is self-evident. */
export interface ArrivalStatus { speed: number; maxSpeed: number; contained: boolean }
export function arrivalStatus(game: GameState): ArrivalStatus | undefined {
  const condition = currentObjective(game)?.condition;
  if (!condition) return undefined;
  let region: Region;
  let maxSpeed: number | undefined;
  if (condition.type === 'near_entity') {
    const target = findEntity(game, condition.targetId);
    if (!target) return undefined;
    region = { shape: 'circle', center: target.position, radius: target.radius };
    maxSpeed = condition.maxSpeed;
  } else if (condition.type === 'speed_in_region') {
    region = condition.region;
    maxSpeed = condition.maxSpeed;
  } else return undefined;
  if (maxSpeed === undefined || region.shape !== 'circle') return undefined;
  const entity = findEntity(game, condition.entityId);
  const body = entity && game.bodies.find(item => item.id === entity.id);
  if (!entity || !body) return undefined;
  // Inline rather than `sub`/`length`: this runs on the live step, and the live step's whole
  // discipline (world.ts:26) is that it does not allocate per call.
  const distance = Math.hypot(body.position.x - region.center.x, body.position.y - region.center.y);
  // Only once the ark has reached the destination at all -- touching the rim counts, still
  // crossing the map does not. Otherwise every step of the approach would nag.
  if (distance > region.radius + entity.radius) return undefined;
  const speed = length(body.velocity);
  const contained = distance + (condition.fullContainment ? entity.radius : 0) <= region.radius;
  if (contained && speed <= maxSpeed) return undefined; // the condition holds; nothing to explain
  return { speed, maxSpeed, contained };
}

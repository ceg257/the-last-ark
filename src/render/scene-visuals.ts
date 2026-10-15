import type { Body, GameState, Phase } from '../game/types';
import { clamp } from '../physics/vector';
import type { Starfield } from './starfield';
import { createStarfield } from './starfield';
import type { Trail, TrailStyle } from './trail';
import { appendTrailSample, createTrail, playerTrailStyle, resetTrail, shipTrailStyle } from './trail';

export type QualityLevel = 'off' | 'low' | 'medium' | 'high';
export interface QualitySpec {
  /** Stars across all depth layers. 0 disables the starfield entirely. */
  stars: number;
  /** Trail ring-buffer capacity in vertices. 0 disables trails. */
  trailPoints: number;
  /** Taper contour rings drawn per field: 0 or 3, plus the boundary ring. */
  fieldRings: number;
  /** Overlap-lens streamlines -- only meaningful where two fields intersect. */
  streamlines: boolean;
}

export const QUALITY: Record<QualityLevel, QualitySpec> = {
  off: { stars: 0, trailPoints: 0, fieldRings: 0, streamlines: false },
  low: { stars: 180, trailPoints: 32, fieldRings: 1, streamlines: false },
  medium: { stars: 500, trailPoints: 64, fieldRings: 3, streamlines: false },
  high: { stars: 1100, trailPoints: 96, fieldRings: 3, streamlines: true },
};
export const DEFAULT_QUALITY: QualityLevel = 'medium';
/** Seed for the title screen, before any level is known. Matches firstLevel.seed. */
export const TITLE_SEED = 2401;
/** Longest frame delta the visual clock accepts. main.ts:62 hands us a huge `seconds` when
 * a backgrounded tab regains focus; unclamped it would jump every animated effect at once. */
const MAX_FRAME_SECONDS = 0.1;

/** `?fx=` works in production builds and touches no Level, so it lives here rather than in
 * debug/config.ts, which is DEV-gated and rewrites level config. */
export function parseQuality(search: string): QualityLevel {
  const value = new URLSearchParams(search).get('fx');
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high' ? value : DEFAULT_QUALITY;
}

/** A trail and the style it was built with. The style is stored rather than rebuilt because
 * building one allocates, and this would otherwise happen once per entity per frame. */
export interface TrailSlot { trail: Trail; style: TrailStyle }

/** All render-only state. Deliberately holds no Camera and no canvas context: everything
 * camera-dependent happens in the draw functions, which is what makes `updateVisuals`
 * callable -- and its "never writes the simulation" contract assertable -- from node. */
export interface VisualState {
  readonly quality: QualityLevel;
  readonly spec: QualitySpec;
  /** Last `scenes.revision` applied. A change means a new scene or a checkpoint restore. */
  revision: number;
  /** The level the starfield was generated for. */
  levelId: string;
  starfield: Starfield;
  /** Keyed by entity id. See buildTrails. */
  trails: Map<string, TrailSlot>;
  phase: Phase | 'title';
  /** Visual seconds. Never fed back into the simulation. */
  time: number;
}

export function createVisualState(quality: QualityLevel = DEFAULT_QUALITY): VisualState {
  const spec = QUALITY[quality];
  return {
    quality, spec, revision: -1, levelId: '', starfield: createStarfield(TITLE_SEED, spec),
    trails: new Map(), phase: 'title', time: 0,
  };
}

/** Clears the drawn tails but keeps the slots: a checkpoint restore keeps the same entity
 * ids, so only the geometry is stale. */
export function resetVisuals(state: VisualState): void {
  state.time = 0;
  for (const slot of state.trails.values()) resetTrail(slot.trail);
}

function findShip(game: GameState): Body | undefined {
  for (let i = 0; i < game.bodies.length; i++) if (game.bodies[i].kind === 'ship') return game.bodies[i];
  return undefined;
}

/** Keyed by entity id -- the ship's own id (never a hardcoded 'ark') plus the player ids. */
function buildTrails(state: VisualState, game: GameState | undefined): void {
  state.trails.clear();
  if (!game) return;
  const ship = findShip(game);
  if (ship) {
    const style = shipTrailStyle(state.spec);
    state.trails.set(ship.id, { trail: createTrail(style.capacity), style });
  }
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    const style = playerTrailStyle(player.field.polarity, state.spec);
    state.trails.set(player.id, { trail: createTrail(style.capacity), style });
  }
}

/** Advance render state by one frame.
 *
 * `scenes.revision` is the only reset signal needed: SceneController.enter (revision++) and
 * .retry (revision++) cover scene changes, R checkpoint restore and Shift+R restart alike.
 * The level-id check is belt and braces, and it is also what reseeds the starfield -- keyed
 * on level id so the field cannot be rebuilt out from under a running level. */
export function updateVisuals(state: VisualState, game: GameState | undefined, revision: number, frameSeconds: number): void {
  if (state.revision !== revision) { resetVisuals(state); state.revision = revision; }
  const levelId = game?.level.id ?? 'title';
  if (levelId !== state.levelId) {
    state.starfield = createStarfield(game?.level.seed ?? TITLE_SEED, state.spec);
    buildTrails(state, game);
    state.levelId = levelId;
  }
  state.time += Number.isFinite(frameSeconds) ? clamp(frameSeconds, 0, MAX_FRAME_SECONDS) : 0;
  state.phase = game?.phase ?? 'title';
  // Appending only while running freezes the tail on pause, stops it growing after the run
  // ends, and leaves 'ready' empty because the restart already bumped the revision.
  if (!game || game.phase !== 'running') return;
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    const slot = state.trails.get(player.id);
    if (slot) appendTrailSample(slot.trail, player.position.x, player.position.y, slot.style);
  }
  const ship = findShip(game);
  if (ship) {
    const slot = state.trails.get(ship.id);
    if (slot) appendTrailSample(slot.trail, ship.position.x, ship.position.y, slot.style);
  }
}

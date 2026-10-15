import type { Vec2 } from '../physics/vector';
import type { Rect } from '../world/geometry';
import type { Mission, MissionState } from './mission';
import type { SceneId } from '../scenes/types';
export interface Field { radius: number; strength: number; softening: number; maxAcceleration: number; polarity: 1 | -1 }
export type EntityKind = 'ship' | 'player' | 'asteroid' | 'planet' | 'star' | 'black_hole' | 'station' | 'wormhole';
export interface Entity {
  id: string;
  kind: EntityKind;
  position: Vec2;
  radius: number;
  layer?: 'world' | 'background' | 'hidden';
}
export interface Body extends Entity {
  kind: Exclude<EntityKind, 'player'>;
  velocity: Vec2;
  affectedByFields: boolean;
  /** Acceleration response: 1 for small bodies, 0.18 for the movable first-level planet. */
  response: number;
  /** Relative density; mass is proportional to sphere volume. Defaults: 1, black hole 40. */
  density?: number;
  /** World units/second; defaults to the global celestial-body cap. */
  maxSpeed?: number;
  captureRadius?: number;
  motion?: 'dynamic' | 'static' | 'kinematic';
  emitsGravity?: boolean;
  collision?: 'none' | 'hazard' | 'capture';
  gravityRadius?: number;
}
export interface Player extends Entity { kind: 'player'; id: 'attractor' | 'repulsor'; speed: number; field: Field; active: boolean }
export interface Port { position: Vec2; radius: number; maxEntrySpeed: number }
export interface Level {
  id: string; name: string;
  /** Reference framing only. Never a physical boundary or a viewport size. */
  width: number; height: number;
  bodies: Body[]; players: [Player, Player]; port?: Port;
  mapBounds?: Rect;
  /** Explicit optional mission boundary, independent of the camera. */
  missionBounds?: Rect;
  mission?: Mission;
  seed?: number;
}
export type Phase = 'ready' | 'running' | 'paused' | 'completed' | 'failed';
export interface GameState {
  level: Level; bodies: Body[]; players: [Player, Player]; phase: Phase; elapsed: number; message: string;
  mission: MissionState;
  pendingScene?: SceneId;
  checkpoint?: { id: string; snapshot: Omit<GameState, 'checkpoint'> };
}
export interface Controls { movement: [Vec2, Vec2]; fields: [boolean, boolean] }
export const NO_CONTROLS: Controls = { movement: [{ x: 0, y: 0 }, { x: 0, y: 0 }], fields: [false, false] };

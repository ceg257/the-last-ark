import type { Vec2 } from '../physics/vector';
export interface Field { radius: number; strength: number; softening: number; maxAcceleration: number; polarity: 1 | -1 }
export interface Body {
  id: string;
  kind: 'ship' | 'asteroid' | 'planet' | 'blackHole';
  position: Vec2;
  velocity: Vec2;
  radius: number;
  affectedByFields: boolean;
  /** 1 for small bodies; near-zero for massive bodies (gameplay approximation). */
  response: number;
  /** Relative density; mass is proportional to sphere volume. Defaults: 1, black hole 40. */
  density?: number;
  /** World units/second; defaults to the global celestial-body cap. */
  maxSpeed?: number;
  captureRadius?: number;
}
export interface Player { id: 'attractor' | 'repulsor'; position: Vec2; radius: number; speed: number; field: Field; active: boolean }
export interface Port { position: Vec2; radius: number; maxEntrySpeed: number }
export interface Level { id: string; name: string; width: number; height: number; bodies: Body[]; players: [Player, Player]; port: Port }
export type Phase = 'ready' | 'running' | 'paused' | 'won' | 'lost';
export interface GameState { level: Level; bodies: Body[]; players: [Player, Player]; phase: Phase; elapsed: number; message: string }
export interface Controls { movement: [Vec2, Vec2]; fields: [boolean, boolean] }
export const NO_CONTROLS: Controls = { movement: [{ x: 0, y: 0 }, { x: 0, y: 0 }], fields: [false, false] };

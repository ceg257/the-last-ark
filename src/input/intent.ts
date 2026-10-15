import type { Vec2 } from '../physics/vector';

/** Device-independent intent. Axes preserve analog magnitude; physics limits the vector. */
export interface PlayerControlIntent {
  readonly moveX: number;
  readonly moveY: number;
  readonly abilityActive: boolean;
  /** A latched WORLD point, never a screen point reprojected every simulation step.
   * Nonzero movement axes take precedence over this optional target. */
  readonly targetWorldPosition?: Readonly<Vec2>;
}
export type PlayerIndex = 0 | 1;
export interface Controls { readonly players: readonly [PlayerControlIntent, PlayerControlIntent] }
export const NEUTRAL_INTENT: PlayerControlIntent = Object.freeze({ moveX: 0, moveY: 0, abilityActive: false });
export const NO_CONTROLS: Controls = Object.freeze({ players: Object.freeze([NEUTRAL_INTENT, NEUTRAL_INTENT] as const) });
export function createControls(p1: Partial<PlayerControlIntent> = {}, p2: Partial<PlayerControlIntent> = {}): Controls {
  return { players: [copyIntent({ ...NEUTRAL_INTENT, ...p1 }), copyIntent({ ...NEUTRAL_INTENT, ...p2 })] };
}
/** Detach provider-owned buffers and reject invalid device data before it enters dynamics. */
export function copyIntent(intent: PlayerControlIntent): PlayerControlIntent {
  const axis = (value: number) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  const result: PlayerControlIntent = { moveX: axis(intent.moveX), moveY: axis(intent.moveY), abilityActive: intent.abilityActive === true };
  const target = intent.targetWorldPosition;
  return target && Number.isFinite(target.x) && Number.isFinite(target.y)
    ? { ...result, targetWorldPosition: { ...target } } : result;
}

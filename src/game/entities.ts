import type { Body, EntityKind } from './types';

export interface Capabilities {
  motion: 'dynamic' | 'static' | 'kinematic';
  gravity: boolean;
  collision: 'none' | 'hazard' | 'capture';
  response: number;
  density: number;
}
/** Type defaults are isolated here. Physics operates on capabilities, not names. */
export const ENTITY_DEFAULTS: Record<EntityKind, Capabilities> = {
  ship: { motion: 'dynamic', gravity: true, collision: 'none', response: 1, density: 1 },
  player: { motion: 'kinematic', gravity: false, collision: 'none', response: 0, density: 0 },
  asteroid: { motion: 'dynamic', gravity: true, collision: 'hazard', response: 1, density: 1 },
  planet: { motion: 'dynamic', gravity: true, collision: 'hazard', response: 0.18, density: 1 },
  star: { motion: 'dynamic', gravity: true, collision: 'hazard', response: 0.02, density: 2 },
  black_hole: { motion: 'static', gravity: true, collision: 'capture', response: 0, density: 40 },
  station: { motion: 'static', gravity: false, collision: 'none', response: 0, density: 0 },
  wormhole: { motion: 'static', gravity: false, collision: 'none', response: 0, density: 0 },
};
export function capabilities(body: Body): Capabilities {
  if (body.layer === 'background') return { motion: 'static', gravity: false, collision: 'none', response: 0, density: 0 };
  const defaults = ENTITY_DEFAULTS[body.kind];
  return { motion: body.motion ?? defaults.motion, gravity: body.emitsGravity ?? defaults.gravity,
    collision: body.collision ?? defaults.collision, response: body.response, density: body.density ?? defaults.density };
}
export function createBody(config: Pick<Body, 'id' | 'kind' | 'position' | 'radius'> & Partial<Body>): Body {
  const defaults = ENTITY_DEFAULTS[config.kind];
  return structuredClone({ velocity: { x: 0, y: 0 }, affectedByFields: defaults.motion === 'dynamic', response: defaults.response, ...config });
}

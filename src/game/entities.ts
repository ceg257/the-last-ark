import type { Body, EntityKind } from './types';

export interface Capabilities {
  motion: 'dynamic' | 'static' | 'kinematic';
  gravity: boolean;
  collision: 'none' | 'hazard' | 'capture';
  response: number;
  density: number;
  stabilizable: boolean;
}
/** Type defaults are isolated here. Physics operates on capabilities, not names. */
export const ENTITY_DEFAULTS: Record<EntityKind, Capabilities> = {
  ship: { stabilizable: false, motion: 'dynamic', gravity: true, collision: 'none', response: 1, density: 1 },
  player: { stabilizable: false, motion: 'kinematic', gravity: false, collision: 'none', response: 0, density: 0 },
  asteroid: { stabilizable: true, motion: 'dynamic', gravity: true, collision: 'hazard', response: 1, density: 1 },
  planet: { stabilizable: true, motion: 'dynamic', gravity: true, collision: 'hazard', response: 0.18, density: 1 },
  star: { stabilizable: true, motion: 'dynamic', gravity: true, collision: 'hazard', response: 0.02, density: 2 },
  black_hole: { stabilizable: false, motion: 'static', gravity: true, collision: 'capture', response: 0, density: 40 },
  station: { stabilizable: false, motion: 'static', gravity: false, collision: 'none', response: 0, density: 0 },
  wormhole: { stabilizable: false, motion: 'static', gravity: false, collision: 'none', response: 0, density: 0 },
};
export const emptyCapabilities = (): Capabilities =>
  ({ stabilizable: false, motion: 'static', gravity: false, collision: 'none', response: 0, density: 0 });
/** In-place form for the physics hot path: same resolution rules, no allocation.
 * `capabilities` still returns a fresh object -- callers and tests rely on that. */
export function capabilitiesInto(out: Capabilities, body: Body): Capabilities {
  if (body.layer === 'background') {
    out.stabilizable = false; out.motion = 'static'; out.gravity = false;
    out.collision = 'none'; out.response = 0; out.density = 0;
    return out;
  }
  const defaults = ENTITY_DEFAULTS[body.kind];
  out.stabilizable = defaults.stabilizable;
  out.motion = body.motion ?? defaults.motion;
  out.gravity = body.emitsGravity ?? defaults.gravity;
  out.collision = body.collision ?? defaults.collision;
  out.response = body.response;
  out.density = body.density ?? defaults.density;
  return out;
}
export function capabilities(body: Body): Capabilities {
  return capabilitiesInto(emptyCapabilities(), body);
}
export function createBody(config: Pick<Body, 'id' | 'kind' | 'position' | 'radius'> & Partial<Body>): Body {
  const defaults = ENTITY_DEFAULTS[config.kind];
  return structuredClone({ velocity: { x: 0, y: 0 }, affectedByFields: defaults.motion === 'dynamic', response: defaults.response, ...config });
}
